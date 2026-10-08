import { Context } from "hono";
import {
    ADMIN_PASSWORD_HASH_KEY, ADMIN_DISABLE_ENV_PASSWORD_KEY,
    getAdminPasswords, getAdminPasswordHash, isEnvAdminPasswordDisabled,
    getBooleanValue, getSetting, hashPassword, saveSetting,
} from "../utils";
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from "../login_rate_limit";

const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * Parse the change time recorded next to the stored digest by
 * changeAdminPassword (older plain-string rows have none → null).
 */
const getStoredPasswordUpdatedAt = async (
    c: Context<HonoCustomType>,
    stored: string
): Promise<string | null> => {
    if (!stored) return null;
    try {
        const raw = await getSetting(c, ADMIN_PASSWORD_HASH_KEY);
        if (!raw || !raw.startsWith("{")) return null;
        const parsed = JSON.parse(raw);
        const updatedAt = parsed?.updated_at;
        if (typeof updatedAt === "number" && Number.isFinite(updatedAt)) {
            return new Date(updatedAt * 1000).toISOString();
        }
    } catch (e) {
        console.error("Failed to parse admin password updated_at", e);
    }
    return null;
}

/**
 * Read the admin password / login security state for the panel:
 *   - adminPasswordStored:   a panel-changed password digest exists in D1
 *   - adminPasswordUpdatedAt: ISO time of the last password change (or null)
 *   - disableEnvLogin:       the env ADMIN_PASSWORDS recovery path is off
 */
export const getSecuritySettings = async (
    c: Context<HonoCustomType>
): Promise<Response> => {
    const stored = await getAdminPasswordHash(c);
    return c.json({
        adminPasswordStored: !!stored,
        adminPasswordUpdatedAt: await getStoredPasswordUpdatedAt(c, stored),
        disableEnvLogin: await isEnvAdminPasswordDisabled(c, stored),
    });
}

/**
 * Toggle the "disable legacy env-password login" flag. Enabling it requires
 * a stored (panel-changed) password, otherwise nobody could log in again.
 */
export const saveSecuritySettings = async (
    c: Context<HonoCustomType>
): Promise<Response> => {
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const disableEnvLogin = getBooleanValue(body?.disable_env_login);
    if (disableEnvLogin && !(await getAdminPasswordHash(c))) {
        return c.text("No stored admin password, cannot disable env login", 400);
    }
    await saveSetting(
        c,
        ADMIN_DISABLE_ENV_PASSWORD_KEY,
        disableEnvLogin ? "true" : "false"
    );
    return c.json({ success: true, disableEnvLogin });
}

/**
 * Change the admin password from the panel.
 *
 * The client sends sha256 hex digests only (same transport as
 * /open_api/admin_login) — the plaintext never leaves the browser and only
 * the digest is persisted. The env ADMIN_PASSWORDS list stays valid as a
 * recovery path: login accepts the stored digest OR any env password —
 * unless the env path was disabled via saveSecuritySettings.
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
    // (the env path only counts while it has not been disabled)
    const stored = await getAdminPasswordHash(c);
    const envAllowed = !(await isEnvAdminPasswordDisabled(c, stored));
    const envHashed = await Promise.all(getAdminPasswords(c).map(p => hashPassword(p)));
    const currentOk = (!!stored && current === stored)
        || (envAllowed && envHashed.includes(current));
    if (!currentOk) {
        await recordLoginFailure(c, 'change_admin_password');
        return c.text("Current password is incorrect", 401);
    }
    await clearLoginFailures(c, 'change_admin_password');

    // the same D1 settings row also carries the change time shown in the
    // panel (adminPasswordUpdatedAt)
    await saveSetting(c, ADMIN_PASSWORD_HASH_KEY, JSON.stringify({
        hash: next,
        updated_at: Math.floor(Date.now() / 1000),
    }));
    return c.json({ success: true });
}
