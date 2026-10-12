import { Context, Hono } from 'hono'
import { verifyAddressToken } from '../address_auth';
import { createMimeMessage } from 'mimetext';
import { Resend } from 'resend';
import { WorkerMailer, WorkerMailerOptions } from 'worker-mailer';

import i18n from '../i18n';
import { CONSTANTS } from '../constants'
import { getJsonSetting, getDomains, getBooleanValue, getJsonObjectValue, getDomainMapValue, getMailDomain, includesDomain } from '../utils';
import { GeoData } from '../models'
import { handleListQuery, isGlobalSendMailEnabled, resolveSendMailBindingEnabled, updateAddressUpdatedAt } from '../common'
import { getSendMailOverride } from '../mail_domains';
import { getSendBalanceState, refundSendBalance, requestSendMailAccess } from './send_balance';
import { ensureSendMailLimit, increaseSendMailLimitCount } from './send_mail_limit_utils';


export const api = new Hono<HonoCustomType>()

api.post('/api/request_send_mail_access', async (c) => {
    const msgs = i18n.getMessagesbyContext(c);
    const { address } = c.get("jwtPayload")
    if (!address) {
        return c.text(msgs.AddressNotFoundMsg, 400)
    }
    const result = await requestSendMailAccess(c, address);
    if (result.status === "ok") {
        return c.json({ status: "ok" })
    }
    if (result.status === "already_requested") {
        return c.text(msgs.AlreadyRequestedMsg, 400)
    }
    return c.text(msgs.OperationFailedMsg, 500)
})

export const sendMailToVerifyAddress = async (
    c: Context<HonoCustomType>, address: string,
    reqJson: {
        from_name: string, to_mail: string, to_name: string,
        subject: string, content: string, is_html: boolean
    }
): Promise<void> => {
    const {
        from_name, to_mail, to_name,
        subject, content, is_html
    } = reqJson;
    const msg = createMimeMessage();
    msg.setSender(from_name ? { name: from_name, addr: address } : address);
    msg.setRecipient(to_name ? { name: to_name, addr: to_mail } : to_mail);
    msg.setSubject(subject);
    msg.addMessage({
        contentType: is_html ? 'text/html' : 'text/plain',
        data: content
    });
    const { EmailMessage } = await import('cloudflare:email');
    const message = new EmailMessage(address, to_mail, msg.asRaw());
    await c.env.SEND_MAIL.send(message);
}

export const sendMailByBinding = async (
    c: Context<HonoCustomType>, address: string,
    reqJson: {
        from_name: string, to_mail: string, to_name: string,
        subject: string, content: string, is_html: boolean
    }
): Promise<void> => {
    const {
        from_name, to_mail, to_name,
        subject, content, is_html
    } = reqJson;
    await c.env.SEND_MAIL.send({
        from: from_name ? { email: address, name: from_name } : address,
        to: to_name ? [`${to_name} <${to_mail}>`] : [to_mail],
        subject,
        ...(is_html ? { html: content } : { text: content }),
    });
}

const sendMailByResend = async (
    c: Context<HonoCustomType>, address: string,
    reqJson: {
        from_name: string, to_mail: string, to_name: string,
        subject: string, content: string, is_html: boolean
    }
): Promise<void> => {
    const mailDomain = getMailDomain(address);
    const token = c.env[
        `RESEND_TOKEN_${mailDomain.replace(/\./g, "_").toUpperCase()}`
    ] || c.env.RESEND_TOKEN;
    const resend = new Resend(token);
    const { data, error } = await resend.emails.send({
        from: reqJson.from_name ? `${reqJson.from_name} <${address}>` : address,
        to: reqJson.to_name ? `${reqJson.to_name} <${reqJson.to_mail}>` : reqJson.to_mail,
        subject: reqJson.subject,
        ...(reqJson.is_html ? {
            html: reqJson.content,
        } : {
            text: reqJson.content,
        })
    });
    if (error) {
        throw new Error(`Resend error: ${error.name} ${error.message}`);
    }
    console.log(`Resend success: ${JSON.stringify(data)}`);
}

const sendMailBySmtp = async (
    c: Context<HonoCustomType>, address: string,
    reqJson: {
        from_name: string, to_mail: string, to_name: string,
        subject: string, content: string, is_html: boolean
    },
    smtpOptions: WorkerMailerOptions
): Promise<void> => {
    await WorkerMailer.send(
        smtpOptions,
        {
            from: {
                name: reqJson.from_name,
                email: address
            },
            to: {
                name: reqJson.to_name,
                email: reqJson.to_mail
            },
            subject: reqJson.subject,
            text: reqJson.is_html ? undefined : reqJson.content,
            html: reqJson.is_html ? reqJson.content : undefined
        }
    )
}

// 发信审计：每次真正投递（成功 / 失败）写一条 send_log。表缺失（未迁移）时
// 只告警、不影响发信主流程。
export const appendSendLog = async (
    c: Context<HonoCustomType>,
    entry: {
        address: string,
        reqJson: {
            to_mail?: string,
            subject?: string,
        },
        channel: string,
        status: 'success' | 'failed',
        error?: string,
    }
): Promise<void> => {
    try {
        const reqIp = c.req.raw.headers.get("cf-connecting-ip") || "";
        await c.env.DB.prepare(
            `INSERT INTO send_log (address, to_mail, subject, channel, status, error, req_ip)
            VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            entry.address || "",
            entry.reqJson?.to_mail || "",
            entry.reqJson?.subject || "",
            entry.channel,
            entry.status,
            entry.error || "",
            reqIp
        ).run();
    } catch (e) {
        console.warn(`Failed to append send_log for ${entry.address}`, e);
    }
}

export const sendMail = async (
    c: Context<HonoCustomType>, address: string,
    reqJson: {
        from_name: string, to_mail: string, to_name: string,
        subject: string, content: string, is_html: boolean
    },
    options?: {
        isAdmin?: boolean,
        // 系统邮件（如注册验证码）不受站点级主开关影响
        isSystem?: boolean
    }
): Promise<void> => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!address) {
        throw new Error(msgs.AddressNotFoundMsg)
    }
    // 三层开关的第一层：站点级 DB 主开关 stored false 时全站停发；
    // 管理员发送与系统邮件不受影响（禁发不应阻断注册验证码这类内部邮件）。
    if (!options?.isAdmin && !options?.isSystem
        && !(await isGlobalSendMailEnabled(c))) {
        throw new Error(msgs.SendMailDisabledMsg)
    }
    // check domain
    const mailDomain = getMailDomain(address);
    const domains = getDomains(c);
    if (!includesDomain(domains, mailDomain)) {
        throw new Error(msgs.InvalidDomainMsg)
    }
    // 问题6 批次1: the D1 per-domain 发信 switch is a kill switch first —
    // only domains present in the stored list are affected, env-only sites
    // keep the exact legacy behaviour below (incl. the verified-list path)
    const sendMailOverride = await getSendMailOverride(c, mailDomain);
    if (sendMailOverride === false) {
        throw new Error(msgs.SendMailDisabledForDomainMsg)
    }
    const sendBalanceState = await getSendBalanceState(c, address, {
        isAdmin: options?.isAdmin,
    });
    if (sendBalanceState.needCheckBalance) {
        if (!sendBalanceState.balance || sendBalanceState.balance <= 0) {
            throw new Error(msgs.NoBalanceMsg)
        }
    }
    const {
        from_name, to_mail, to_name,
        subject, content, is_html
    } = reqJson;
    if (!to_mail) {
        throw new Error(msgs.InvalidToMailMsg)
    }
    // check SEND_BLOCK_LIST_KEY
    const sendBlockList = await getJsonSetting(c, CONSTANTS.SEND_BLOCK_LIST_KEY) as string[];
    if (sendBlockList && sendBlockList.some((item) => to_mail.includes(item))) {
        throw new Error(msgs.AddressBlockedMsg)
    }
    if (!subject) {
        throw new Error(msgs.SubjectEmptyMsg)
    }
    if (!content) {
        throw new Error(msgs.ContentEmptyMsg)
    }
    await ensureSendMailLimit(c, mailDomain);

    // 通道可用性：投递链路按 resend → smtp → SEND_MAIL binding 顺序选择
    const resendEnabled = c.env.RESEND_TOKEN || c.env[
        `RESEND_TOKEN_${mailDomain.replace(/\./g, "_").toUpperCase()}`
    ];
    const smtpConfigMap = getJsonObjectValue<Record<string, WorkerMailerOptions>>(c.env.SMTP_CONFIG);
    const smtpConfig = getDomainMapValue(smtpConfigMap, mailDomain);
    // 问题6: stored switch wins (true allows the binding for that domain),
    // env SEND_MAIL_DOMAINS stays the fallback for unmanaged domains
    const sendMailBindingEnabled = await resolveSendMailBindingEnabled(c, mailDomain);

    // 通道判定（供审计日志记录；投递到已验证地址列表时走 binding 但不计费）
    let channel = "none";
    if (resendEnabled) {
        channel = "resend";
    } else if (smtpConfig) {
        channel = "smtp";
    } else if (sendMailBindingEnabled) {
        channel = "binding";
    }
    let sendByVerifiedAddressList = false;
    if (c.env.SEND_MAIL) {
        const verifiedAddressList = await getJsonSetting(c, CONSTANTS.VERIFIED_ADDRESS_LIST_KEY) || [];
        if (verifiedAddressList.includes(to_mail)) {
            sendByVerifiedAddressList = true;
            channel = "binding_verified";
        }
    }
    if (!sendByVerifiedAddressList && channel === "none") {
        throw new Error(`${msgs.EnableResendOrSmtpOrSendMailMsg} (${mailDomain})`);
    }

    // 原子预留：投递前先按 balance >= 1 扣一个额度，避免并发竞态
    // （旧实现投递后再 balance - 1，两人同时读到 1 会扣成 -1）。投递失败回补。
    let balanceReserved = false;
    if (!sendByVerifiedAddressList && sendBalanceState.needCheckBalance) {
        const { meta } = await c.env.DB.prepare(
            `UPDATE address_sender SET balance = balance - 1
            WHERE address = ? AND enabled = 1 AND balance >= 1`
        ).bind(address).run();
        if (!meta || meta.changes !== 1) {
            throw new Error(msgs.NoBalanceMsg)
        }
        balanceReserved = true;
    }

    // send mail workflow
    try {
        if (sendByVerifiedAddressList) {
            // 已验证地址：经 SEND_MAIL binding 投递，不扣额度
            await sendMailToVerifyAddress(c, address, reqJson);
        }
        else if (resendEnabled) {
            await sendMailByResend(c, address, reqJson);
        }
        else if (smtpConfig) {
            await sendMailBySmtp(c, address, reqJson, smtpConfig);
        }
        else {
            await sendMailByBinding(c, address, reqJson);
        }
    } catch (e) {
        if (balanceReserved) {
            await refundSendBalance(c, address);
        }
        await appendSendLog(c, {
            address, reqJson, channel, status: 'failed',
            error: (e as Error)?.message || '',
        });
        throw e;
    }
    await increaseSendMailLimitCount(c, mailDomain);
    await appendSendLog(c, { address, reqJson, channel, status: 'success' });
    // update address updated_at
    updateAddressUpdatedAt(c, address);
    // save to sendbox
    try {
        const reqIp = c.req.raw.headers.get("cf-connecting-ip")
        const geoData = new GeoData(reqIp, c.req.raw.cf as any);
        const body = {
            version: "v2",
            ...reqJson,
            geoData: geoData,
        };
        const { success: success2 } = await c.env.DB.prepare(
            `INSERT INTO sendbox (address, raw) VALUES (?, ?)`
        ).bind(address, JSON.stringify(body)).run();
        if (!success2) {
            console.warn(`Failed to save to sendbox for ${address}`);
        }
    } catch (e) {
        console.warn(`Failed to save to sendbox for ${address}`);
    }
}

api.post('/api/send_mail', async (c) => {
    const { address } = c.get("jwtPayload")
    const reqJson = await c.req.json();
    try {
        await sendMail(c, address, reqJson);
    } catch (e) {
        console.error("Failed to send mail", e);
        return c.text(`Failed to send mail ${(e as Error).message}`, 400)
    }
    return c.json({ status: "ok" })
})

api.post('/external/api/send_mail', async (c) => {
    const body = await c.req.json();
    try {
        const { address } = await verifyAddressToken(c, body?.token);
        const { from_name, to_mail, to_name, subject, content, is_html } = body;
        const reqJson = { from_name, to_mail, to_name, subject, content, is_html };
        await sendMail(c, address as string, reqJson);
        return c.json({ status: "ok" })
    } catch (e) {
        console.error("Failed to send mail", e);
        return c.text(`Failed to send mail ${(e as Error).message}`, 400)
    }
})

export const getSendbox = async (
    c: Context<HonoCustomType>,
    address: string, limit: string, offset: string
): Promise<Response> => {
    if (!address) {
        return c.json({ "error": "No address" }, 400)
    }
    return await handleListQuery(c,
        `SELECT * FROM sendbox where address = ? `,
        `SELECT count(*) as count FROM sendbox where address = ? `,
        [address], limit, offset
    );
}

api.get('/api/sendbox', async (c) => {
    const { address } = c.get("jwtPayload")
    const { limit, offset } = c.req.query();
    return getSendbox(c, address, limit, offset);
})

api.delete('/api/sendbox/:id', async (c) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL)) {
        return c.text(msgs.UserDeleteEmailDisabledMsg, 403)
    }
    const { address } = c.get("jwtPayload")
    const { id } = c.req.param();
    const { success } = await c.env.DB.prepare(
        `DELETE FROM sendbox WHERE address = ? and id = ? `
    ).bind(address, id).run();
    return c.json({
        success: success
    })
})
