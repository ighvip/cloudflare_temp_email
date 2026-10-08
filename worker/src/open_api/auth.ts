import { Hono } from 'hono'
import { verifyAddressToken } from '../address_auth';
import { Jwt } from 'hono/utils/jwt';

import utils, { checkCfTurnstile, getPasswords, getAdminPasswords, getAdminPasswordHash, isEnvAdminPasswordDisabled, hashPassword } from '../utils';
import i18n from '../i18n';
import { ErrorCode } from '../error_codes';
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from '../login_rate_limit';

const api = new Hono<HonoCustomType>()

api.post('/open_api/site_login', async (c) => {
    const { password, cf_token } = await c.req.json();
    const msgs = i18n.getMessagesbyContext(c);
    // P0 B2: lock out brute force attempts before the credential comparison
    const rateLimited = await checkLoginRateLimit(c, 'site_login');
    if (rateLimited) return rateLimited;
    if (utils.isGlobalTurnstileEnabled(c)) {
        try {
            await checkCfTurnstile(c, cf_token);
        } catch (error) {
            return c.text(msgs.TurnstileCheckFailedMsg, 400)
        }
    }
    const passwords = getPasswords(c);
    const hashedPasswords = await Promise.all(passwords.map(p => hashPassword(p)));
    if (!hashedPasswords.length || !password || !hashedPasswords.includes(password)) {
        await recordLoginFailure(c, 'site_login');
        return c.json({ code: ErrorCode.AUTH_SITE_PASSWORD_INVALID, message: msgs.CustomAuthPasswordMsg }, 401)
    }
    await clearLoginFailures(c, 'site_login');
    return c.json({ success: true })
})

api.post('/open_api/admin_login', async (c) => {
    const { password, cf_token } = await c.req.json();
    const msgs = i18n.getMessagesbyContext(c);
    // P0 B2: lock out brute force attempts before the credential comparison
    const rateLimited = await checkLoginRateLimit(c, 'admin_login');
    if (rateLimited) return rateLimited;
    if (utils.isGlobalTurnstileEnabled(c)) {
        try {
            await checkCfTurnstile(c, cf_token);
        } catch (error) {
            return c.text(msgs.TurnstileCheckFailedMsg, 400)
        }
    }
    const adminPasswords = getAdminPasswords(c);
    const hashedPasswords = await Promise.all(adminPasswords.map(p => hashPassword(p)));
    // panel-changed password (stored digest) OR the env ADMIN_PASSWORDS list
    const storedHash = await getAdminPasswordHash(c);
    // the env list is only a recovery path until the panel disables it
    const envLoginAllowed = !(await isEnvAdminPasswordDisabled(c, storedHash));
    const passwordValid = !!password
        && ((envLoginAllowed && hashedPasswords.includes(password))
            || (!!storedHash && password === storedHash));
    if (!passwordValid) {
        await recordLoginFailure(c, 'admin_login');
        return c.json({ code: ErrorCode.AUTH_ADMIN_CREDENTIAL_INVALID, message: msgs.NeedAdminPasswordMsg }, 401)
    }
    await clearLoginFailures(c, 'admin_login');

    // P0-B3: issue an admin-scoped JWT (30 min, jti, D1 revocable)
    const jti = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const exp = Math.floor(Date.now() / 1000) + 30 * 60;
    const adminToken = await Jwt.sign({ scope: "admin", jti, exp, iat: Math.floor(Date.now() / 1000) }, c.env.JWT_SECRET, "HS256");

    return c.json({ success: true, admin_token: adminToken })
})

// P0-B3: revoke the current admin JWT so subsequent requests are rejected
api.post('/open_api/admin_logout', async (c) => {
    const authHeader = c.req.raw.headers.get("Authorization");
    const bearerMatch = authHeader?.match(/^Bearer\s+(\S+)$/i);
    if (bearerMatch) {
        try {
            const payload: any = await Jwt.verify(bearerMatch[1], c.env.JWT_SECRET, "HS256");
            if (payload.jti) {
                await c.env.DB.prepare(
                    `INSERT OR REPLACE INTO admin_token_blacklist (jti, expires_at) VALUES (?, ?)`
                ).bind(payload.jti, payload.exp ?? 0).run();
            }
        } catch (e) {
            console.error("admin_logout JWT parse failed", e);
        }
    }
    return c.json({ success: true });
})

api.post('/open_api/credential_login', async (c) => {
    const { credential, cf_token } = await c.req.json();
    const msgs = i18n.getMessagesbyContext(c);
    // P0 B2: lock out brute force attempts before the credential comparison
    const rateLimited = await checkLoginRateLimit(c, 'credential_login');
    if (rateLimited) return rateLimited;
    if (utils.isGlobalTurnstileEnabled(c)) {
        try {
            await checkCfTurnstile(c, cf_token);
        } catch (error) {
            return c.text(msgs.TurnstileCheckFailedMsg, 400)
        }
    }
    if (!credential) {
        await recordLoginFailure(c, 'credential_login');
        return c.text(msgs.InvalidAddressCredentialMsg, 401)
    }
    try {
        await verifyAddressToken(c, credential);
    } catch (error) {
        await recordLoginFailure(c, 'credential_login');
        return c.text(msgs.InvalidAddressCredentialMsg, 401)
    }
    await clearLoginFailures(c, 'credential_login');
    return c.json({ success: true })
})

export { api }
