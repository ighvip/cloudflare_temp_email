import { Context } from 'hono'

import i18n from '../i18n'
import { sendAdminInternalMail } from '../email/storage'
import { handleListQuery } from '../common'

const list = async (c: Context<HonoCustomType>) => {
    const { address, limit, offset } = c.req.query();
    if (address) {
        return await handleListQuery(c,
            `SELECT * FROM address_sender where address = ? `,
            `SELECT count(*) as count FROM address_sender where address = ? `,
            [address], limit, offset
        );
    }
    return await handleListQuery(c,
        `SELECT * FROM address_sender `,
        `SELECT count(*) as count FROM address_sender `,
        [], limit, offset
    );
};

const update = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    /* eslint-disable prefer-const */
    let { address, address_id, balance, enabled } = await c.req.json();
    /* eslint-enable prefer-const */
    if (!address_id) {
        return c.text(msgs.InvalidAddressIdMsg, 400)
    }
    enabled = enabled ? 1 : 0;
    const { success } = await c.env.DB.prepare(
        `UPDATE address_sender SET enabled = ?, balance = ? WHERE id = ? `
    ).bind(enabled, balance, address_id).run();
    if (!success) {
        return c.text(msgs.OperationFailedMsg, 500)
    }
    await sendAdminInternalMail(
        c, address, "Account Send Access Updated",
        `Your send access has been ${enabled ? "enabled" : "disabled"}, balance: ${balance}`
    );
    return c.json({ success });
};

// 余额 +/-N：按增量调整，服务端原子执行（不做读改写），结果夹到 >= 0。
// 与上面的绝对赋值接口互补，供管理端"发放/回收额度"使用。
const adjustBalance = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    const { address_id, delta } = await c.req.json();
    if (!address_id) {
        return c.text(msgs.InvalidAddressIdMsg, 400)
    }
    // 增量上限与绝对赋值表单的上限保持一致，避免误填超大数值
    if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0
        || delta < -100000 || delta > 100000) {
        return c.text(msgs.InvalidInputMsg, 400)
    }
    const row = await c.env.DB.prepare(
        `SELECT address FROM address_sender WHERE id = ?`
    ).bind(address_id).first<{ address: string }>();
    if (!row) {
        return c.text(msgs.OperationFailedMsg, 404)
    }
    const { success } = await c.env.DB.prepare(
        `UPDATE address_sender SET balance = MAX(COALESCE(balance, 0) + ?, 0) WHERE id = ?`
    ).bind(delta, address_id).run();
    if (!success) {
        return c.text(msgs.OperationFailedMsg, 500)
    }
    const balance = await c.env.DB.prepare(
        `SELECT balance FROM address_sender WHERE id = ?`
    ).bind(address_id).first<number>('balance');
    await sendAdminInternalMail(
        c, row.address, "Account Send Access Updated",
        `Your send balance has been adjusted by ${delta > 0 ? "+" : ""}${delta}, balance: ${balance}`
    );
    return c.json({ success, balance });
};

const remove = async (c: Context<HonoCustomType>) => {
    const { id } = c.req.param();
    const { success } = await c.env.DB.prepare(
        `DELETE FROM address_sender WHERE id = ? `
    ).bind(id).run();
    return c.json({ success });
};

export default { list, update, adjustBalance, remove };
