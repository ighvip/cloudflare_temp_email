import { Hono } from 'hono'
import { Context } from 'hono'
import { ServerResponse } from 'node:http'
import { Writable } from 'node:stream'

import { newTelegramBot, initTelegramBotCommands, sendMailToTelegram } from './telegram'
import { CONSTANTS } from '../constants'
import settings from './settings'
import miniapp from './miniapp'
import i18n from '../i18n'

export const api = new Hono<HonoCustomType>();
export { sendMailToTelegram }

api.use("/telegram/*", async (c, next) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!c.env.TELEGRAM_BOT_TOKEN) {
        return c.text(msgs.TgBotTokenRequiredMsg, 400);
    }
    if (!c.env.KV) {
        return c.text(msgs.KVNotAvailableMsg, 400);
    }
    return await next();
});

api.use("/admin/telegram/*", async (c, next) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!c.env.TELEGRAM_BOT_TOKEN) {
        return c.text(msgs.TgBotTokenRequiredMsg, 400);
    }
    if (!c.env.KV) {
        return c.text(msgs.KVNotAvailableMsg, 400);
    }
    return await next();
});

/**
 * Secret Telegram echoes back in the X-Telegram-Bot-Api-Secret-Token header.
 * TELEGRAM_WEBHOOK_SECRET wins when configured; otherwise a random secret is
 * generated once and kept in KV (see ensureTelegramWebhookSecret).
 */
const getTelegramWebhookSecret = async (
    c: Context<HonoCustomType>
): Promise<string | undefined> => {
    if (c.env.TELEGRAM_WEBHOOK_SECRET) {
        return c.env.TELEGRAM_WEBHOOK_SECRET;
    }
    if (!c.env.KV) {
        return undefined;
    }
    return await c.env.KV.get(CONSTANTS.TG_WEBHOOK_SECRET_KEY) || undefined;
};

const ensureTelegramWebhookSecret = async (
    c: Context<HonoCustomType>
): Promise<string> => {
    const existing = await getTelegramWebhookSecret(c);
    if (existing) {
        return existing;
    }
    // Telegram only allows A-Z a-z 0-9 _ - inside the secret token.
    const secret = crypto.randomUUID().replace(/-/g, '');
    await c.env.KV.put(CONSTANTS.TG_WEBHOOK_SECRET_KEY, secret);
    return secret;
};

/** Length-safe, constant-time-ish comparison (no early exit on content). */
const secretsMatch = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
};

api.post("/telegram/webhook", async (c) => {
    // P0: the webhook URL is public and guessable. Telegram signs every update
    // with the secret_token declared at setWebhook time; without this check
    // anyone could POST forged updates and drive the bot.
    const expected = await getTelegramWebhookSecret(c);
    if (!expected) {
        console.error("telegram webhook rejected: no secret configured; re-run the admin telegram init");
        return c.text("Telegram webhook secret is not configured", 401);
    }
    const provided = c.req.header("X-Telegram-Bot-Api-Secret-Token") || "";
    if (!secretsMatch(provided, expected)) {
        return c.text("Unauthorized", 401);
    }
    const token = c.env.TELEGRAM_BOT_TOKEN;
    const bot = newTelegramBot(c, token);
    let body = null;
    const res = new Writable();
    Object.assign(res, {
        headersSent: false,
        setHeader: (name: string, value: string) => c.header(name, value),
        end: (data: any) => body = data,
    });
    const reqJson = await c.req.json();
    await bot.handleUpdate(reqJson, res as ServerResponse);
    return c.body(body);
});

api.post("/admin/telegram/init", async (c) => {
    const token = c.env.TELEGRAM_BOT_TOKEN;
    // 问题10: no bot token configured → quiet 403 instead of a thrown
    // Telegraf request (the admin page renders a not-enabled panel)
    if (!token) {
        return c.text("Telegram is not enabled (TELEGRAM_BOT_TOKEN not set)", 403);
    }
    const domain = new URL(c.req.url).host;
    const webhookUrl = `https://${domain}/telegram/webhook`;
    console.log(`setting webhook to ${webhookUrl}`);
    const bot = newTelegramBot(c, token);
    // Declare the secret so Telegram signs every update with it; the webhook
    // route refuses updates that do not carry the matching header.
    const secret = await ensureTelegramWebhookSecret(c);
    await bot.telegram.setWebhook(webhookUrl, { secret_token: secret })
    await initTelegramBotCommands(c, bot);
    return c.json({
        message: "webhook set successfully",
    });
});

api.get("/admin/telegram/status", async (c) => {
    const token = c.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        return c.text("Telegram is not enabled (TELEGRAM_BOT_TOKEN not set)", 403);
    }
    const bot = newTelegramBot(c, token);
    const info = await bot.telegram.getWebhookInfo()
    const commands = await bot.telegram.getMyCommands()
    return c.json({
        info,
        commands,
        secret_configured: !!(await getTelegramWebhookSecret(c)),
    });
});

api.get("/admin/telegram/settings", settings.getTelegramSettings);
api.post("/admin/telegram/settings", settings.saveTelegramSettings);
api.post("/telegram/get_bind_address", miniapp.getTelegramBindAddress);
api.post("/telegram/new_address", miniapp.newTelegramAddress);
api.post("/telegram/bind_address", miniapp.bindAddress);
api.post("/telegram/unbind_address", miniapp.unbindAddress);
api.post("/telegram/get_mail", miniapp.getMail);
