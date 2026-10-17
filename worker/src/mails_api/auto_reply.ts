import { Context } from "hono";
import { getBooleanValue } from "../utils";
import i18n from "../i18n";


export default {
    getAutoReply: async (c: Context<HonoCustomType>) => {
        const msgs = i18n.getMessagesbyContext(c);
        if (!getBooleanValue(c.env.ENABLE_AUTO_REPLY)) {
            return c.text(msgs.AutoReplyDisabledMsg, 403)
        }
        const { address } = c.get("jwtPayload")
        const results = await c.env.DB.prepare(
            `SELECT * FROM auto_reply_mails where address = ? `
        ).bind(address).first();
        if (!results) {
            return c.json({});
        }
        return c.json({
            subject: results.subject,
            message: results.message,
            enabled: results.enabled == 1,
            source_prefix: results.source_prefix,
            name: results.name,
        })
    },
    saveAutoReply: async (c: Context<HonoCustomType>) => {
        const msgs = i18n.getMessagesbyContext(c);
        if (!getBooleanValue(c.env.ENABLE_AUTO_REPLY)) {
            return c.text(msgs.AutoReplyDisabledMsg, 403)
        }
        const { address } = c.get("jwtPayload");
        const { auto_reply } = await c.req.json();
        const { name, subject, source_prefix, message, enabled } = auto_reply;
        // A "disable auto reply" save may legitimately omit subject/message;
        // normalise before touching .length (undefined used to throw a 500).
        const subjectText = typeof subject === "string" ? subject : "";
        const messageText = typeof message === "string" ? message : "";
        if ((!subjectText || !messageText) && enabled) {
            return c.text(msgs.InvalidAutoReplyMsg, 400)
        }
        else if (subjectText.length > 255 || messageText.length > 255) {
            return c.text(msgs.SubjectOrMessageTooLongMsg, 400)
        }
        const { success } = await c.env.DB.prepare(
            `INSERT OR REPLACE INTO auto_reply_mails`
            + ` (name, address, source_prefix, subject, message, enabled)`
            + ` VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
            name || '', address, source_prefix || '',
            subjectText, messageText, enabled ? 1 : 0
        ).run();
        if (!success) {
            return c.text(msgs.OperationFailedMsg, 500)
        }
        return c.json({
            success: success
        })
    }
}
