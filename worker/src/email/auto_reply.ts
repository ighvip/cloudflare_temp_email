import { createMimeMessage } from "mimetext";
import { getBooleanValue, getMailDomain, normalizeAddressDomain } from "../utils";
import { envOnlyContext, isGlobalSendMailEnabled } from "../common";
import { getSendMailOverride } from "../mail_domains";

/**
 * Check if the sender matches the source_prefix filter.
 * - empty/undefined: match all senders
 * - starts and ends with `/`: treat as regex (e.g. `/.*@example\.com$/`)
 * - otherwise: legacy startsWith match
 */
function matchSender(from: string, sourcePrefix: string | undefined): boolean {
    if (!sourcePrefix) return true;
    if (sourcePrefix.startsWith("/") && sourcePrefix.endsWith("/") && sourcePrefix.length > 2) {
        try {
            const regex = new RegExp(sourcePrefix.slice(1, -1));
            return regex.test(from);
        } catch (error) {
            console.error("Invalid regex in source_prefix:", sourcePrefix, error);
            return false;
        }
    }
    return from.startsWith(sourcePrefix);
}

/**
 * Auto-reply is a send path, so it honours the same switches as every other
 * one: the site-wide kill switch (`send_mail_enabled`) and the per-domain
 * switch when the recipient domain is a managed one.
 *
 * It is deliberately NOT gated on the env channel check (RESEND / SMTP /
 * SEND_MAIL): auto-reply goes out through CF Email Routing's
 * `message.reply()`, so a site with no outbound channel configured can still
 * auto-reply -- requiring a channel would silently break that behaviour.
 * Domains without a stored entry keep behaving exactly as before.
 */
const isAutoReplySendAllowed = async (
    env: Bindings, toAddress: string
): Promise<boolean> => {
    try {
        const c = envOnlyContext(env);
        if (!(await isGlobalSendMailEnabled(c))) {
            console.log("auto-reply skipped: site-wide send switch is off");
            return false;
        }
        const mailDomain = getMailDomain(toAddress);
        if (!mailDomain) {
            return true;
        }
        const override = await getSendMailOverride(c, mailDomain);
        if (override === false) {
            console.log(`auto-reply skipped: send switch is off for ${mailDomain}`);
            return false;
        }
        return true;
    } catch (error) {
        // A settings read failure must never suppress auto-reply: the feature
        // is already opt-in per user row and falls back to the old behaviour.
        console.error("auto-reply send switch check failed", error);
        return true;
    }
};

export const auto_reply = async (
    message: ForwardableEmailMessage,
    env: Bindings,
    toAddress: string = normalizeAddressDomain(message.to)
): Promise<void> => {
    const message_id = message.headers.get("Message-ID");
    // auto reply email
    if (getBooleanValue(env.ENABLE_AUTO_REPLY) && message_id) {
        if (!(await isAutoReplySendAllowed(env, toAddress))) {
            return;
        }
        try {
            const results = await env.DB.prepare(
                `SELECT * FROM auto_reply_mails where address = ? and enabled = 1`
            ).bind(toAddress).first<Record<string, string>>();
            if (results && matchSender(message.from, results.source_prefix)) {
                if (!results.subject || !results.message) {
                    console.log("auto-reply using defaults:", !results.subject ? "subject" : "", !results.message ? "message" : "");
                }
                const msg = createMimeMessage();
                msg.setHeader("In-Reply-To", message_id);
                msg.setSender({
                    name: results.name || results.address,
                    addr: results.address
                });
                msg.setRecipient(message.from);
                msg.setSubject(results.subject || "Auto-reply");
                msg.addMessage({
                    contentType: 'text/plain',
                    data: results.message || "This is an auto-reply message, please reconact later."
                });
                const { EmailMessage } = await import('cloudflare:email');
                const replyMessage = new EmailMessage(
                    toAddress,
                    message.from,
                    msg.asRaw()
                );
                // @ts-ignore
                await message.reply(replyMessage);
            }
        } catch (error) {
            console.log("reply email error", error);
        }
    }
}
