import { Context } from 'hono'

import { handleListQuery } from '../common'

// 发信审计日志：只读列表 + 删除单条 + 清空。保留时长由自动清理
// （cleanup 'send_log'）负责，管理页也复用通用 /admin/cleanup 接口手动清理。

const VALID_STATUS = ['success', 'failed'];

const list = async (c: Context<HonoCustomType>) => {
    const { address, status, limit, offset } = c.req.query();
    const conditions: string[] = [];
    const params: string[] = [];
    if (address) {
        conditions.push('address = ?');
        params.push(address);
    }
    if (status && VALID_STATUS.includes(status)) {
        conditions.push('status = ?');
        params.push(status);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} ` : '';
    return await handleListQuery(c,
        `SELECT * FROM send_log ${where}`,
        `SELECT count(*) as count FROM send_log ${where}`,
        params, limit, offset
    );
};

const remove = async (c: Context<HonoCustomType>) => {
    const { id } = c.req.param();
    const { success } = await c.env.DB.prepare(
        `DELETE FROM send_log WHERE id = ? `
    ).bind(id).run();
    return c.json({ success });
};

const clear = async (c: Context<HonoCustomType>) => {
    const { success } = await c.env.DB.prepare(
        `DELETE FROM send_log`
    ).run();
    return c.json({ success });
};

export default { list, remove, clear };
