import { Context } from "hono";
import {
    ADMIN_PASSWORD_HASH_KEY, getAdminPasswords, getAdminPasswordHash,
    hashPassword, saveSetting,
} from "../utils";
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from "../login_rate_limit";

const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * Change the admin password from the panel.
 *
 * The client sends sha256 hex digests only (same transport as
 * /open_api/admin_login) — the plaintext never leaves the browser and only
 * the digest is persisted. The env ADMIN_PASSWORDS list stays valid as a
 * recovery path: login accepts the stored digest OR any env password.
 *
 * The current password is always re-verified (approved requirement) so a
 * hijacked admin session cannot silently rotate the credential.
 */
export const changeAdminPassword = async (
    c: Context<HonoCustomType>
): Promise<Response> => {
    const rateLimited = await checkLoginRateLimit(c, 'change_admin_password');
    if (rateLimited) return rateLimited;

    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const current = body?.current_password;
    const next = body?.new_password;
    const confirm = body?.confirm_password;

    if (typeof next !== "string" || !HEX64.test(next)) {
        return c.text("Invalid new password format", 400);
    }
    if (typeof confirm !== "string" || confirm !== next) {
        return c.text("Password confirmation does not match", 400);
    }
    if (typeof current !== "string" || !HEX64.test(current)) {
        return c.text("Current password is required", 400);
    }
    if (current === next) {
        return c.text("New password must differ from the current one", 400);
    }

    // verify the current password against the stored digest or the env list
    const stored = await getAdminPasswordHash(c);
    const envHashed = await Promise.all(getAdminPasswords(c).map(p => hashPassword(p)));
    const currentOk = (!!stored && current === stored) || envHashed.includes(current);
    if (!currentOk) {
        await recordLoginFailure(c, 'change_admin_password');
        return c.text("Current password is incorrect", 401);
    }
    await clearLoginFailures(c, 'change_admin_password');

    await saveSetting(c, ADMIN_PASSWORD_HASH_KEY, JSON.stringify({
        hash: next,
        updated_at: Math.floor(Date.now() / 1000),
    }));
    return c.json({ success: true });
}
