import { Context, Hono } from 'hono'
import { cors } from 'hono/cors';
import { Jwt } from 'hono/utils/jwt'
import { addressJwtAuth } from './address_auth';

import { api as commonApi } from './commom_api';
import { api as openAuthApi } from './open_api/auth';
import { api as mailsApi } from './mails_api'
import { api as userApi } from './user_api';
import { api as adminApi } from './admin_api';
import { api as apiSendMail } from './mails_api/send_mail_api'
import { api as telegramApi } from './telegram_api'
import { api as redeemApi } from './redeem_api'

import i18n from './i18n';
import { ErrorCode } from './error_codes';
import { email } from './email';
import { scheduled } from './scheduled';
import { getPasswords, getBooleanValue, getDomains, checkIsAdmin, getEnvStringList, checkIsAdminWithJwt } from './utils';
import { checkAccessControl } from './ip_blacklist';
import {
	getAdminPath, hasValidGate, injectAdminPath, isAdminPagePath,
	notFoundPage, redeemGateKey, issueGateCookie,
} from './admin_gate';

const API_PATHS = [
	"/api/",
	"/open_api/",
	"/user_api/",
	"/admin/",
	"/telegram/",
	"/external/",
	"/redeem_api/",
];

const app = new Hono<HonoCustomType>()

// ---- P0 B1: security response headers -------------------------------------
// IMPORTANT: `about:srcdoc` iframes (mail body viewer) INHERIT the parent CSP,
// therefore this policy must stay framing-only. Never add script-src /
// style-src / base-uri / object-src here, incoming mails would stop rendering.
const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'SAMEORIGIN',
	'Content-Security-Policy': "frame-ancestors 'self'",
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
	'X-Robots-Tag': 'noindex, nofollow, noarchive',
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

// registered first so it also wraps ASSETS responses, CORS preflights and
// error responses produced deeper in the chain
app.use('/*', async (c, next) => {
	await next()
	const current = c.res
	const headers = new Headers(current.headers)
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		headers.set(key, value)
	}
	// 1xx / 204 / 205 / 304 must not carry a body
	const bodyless = current.status < 200 || current.status === 204
		|| current.status === 205 || current.status === 304
	c.res = new Response(bodyless ? null : current.body, {
		status: current.status,
		statusText: current.statusText,
		headers,
	})
})

// ---- P0 B1: CORS locked to the site origin (+ opt-in allowlist) -----------
const isTrustedOrigin = (origin: string, allowed: string[]): boolean => {
	if (allowed.includes(origin)) return true
	// local development (vite dev server, wrangler dev)
	return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

//cors
app.use('/*', cors({
	origin: (origin, c) => {
		if (!origin) return null
		const self = new URL(c.req.url).origin
		if (origin === self) return origin
		const allowed = getEnvStringList(c.env.CORS_ORIGINS)
		return isTrustedOrigin(origin, allowed) ? origin : null
	},
	allowHeaders: [
		'Content-Type', 'Authorization', 'Accept-Language',
		'x-lang', 'x-fingerprint', 'x-custom-auth',
		'x-admin-auth', 'x-user-token', 'x-user-access-token',
	],
	maxAge: 600,
}))
// error handler
// P0 B1: never leak `err.name` / internal details (D1 SQL, stack, file paths).
// Plain `Error`s carrying short localized user messages still pass through so
// the UI keeps showing real validation reasons.
const INTERNAL_ERROR_MARKER = /D1_ERROR|SQLITE_|\bat\s+\w+\s*\(|file:\/\/|node_modules|\.ts:\d+|\.js:\d+|workerd|wrangler/i
const toPublicErrorMessage = (err: unknown): string | null => {
	if (!(err instanceof Error)) return null
	if (err.name !== 'Error') return null
	const message = (err.message || '').trim()
	if (!message || message.length > 300) return null
	if (INTERNAL_ERROR_MARKER.test(message)) return null
	return message
}
app.onError((err, c) => {
	console.error(err)
	const message = toPublicErrorMessage(err) ?? i18n.getMessagesbyContext(c).OperationFailedMsg
	return c.json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message }, 500)
})
// P0-B4 G1/G2: admin gate — registered before the global middleware so an
// ungated request never reaches the credential checks and cannot leak them.
app.use('/admin/*', async (c, next) => {
	const gateKey = new URL(c.req.url).searchParams.get("k");
	let gateOk = await hasValidGate(c);
	if (!gateOk && gateKey && await redeemGateKey(c, gateKey)) {
		c.header("Set-Cookie", await issueGateCookie(c));
		gateOk = true;
	}
	if (!gateOk) {
		// browser navigations get the branded 404, API calls the plain one
		c.header("Cache-Control", "no-store");
		const accept = c.req.raw.headers.get("Accept") || "";
		if (accept.includes("text/html")) return notFoundPage(c.env.COPYRIGHT || "Not Found");
		return c.notFound();
	}
	await next();
});

// global middlewares
app.use('/*', async (c, next) => {

	// check if the request is for static files
	if (c.env.ASSETS && !API_PATHS.some(path => c.req.path.startsWith(path))) {
		const url = new URL(c.req.raw.url);
		const adminPath = getAdminPath(c);

		// page routes: SPA shell, but the admin page is gated (P0-B4 G2)
		if (!url.pathname.includes('.')) {
			// P0-B4 G1: `?k=` redemption on page routes
			const gateKey = url.searchParams.get("k");
			if (gateKey) {
				if (await redeemGateKey(c, gateKey)) {
					url.searchParams.delete("k");
					let target = url.pathname;
					if (target === "/" || isAdminPagePath(target, adminPath) || isAdminPagePath(target, "/admin")) {
						target = adminPath;
					}
					const query = url.searchParams.toString();
					return new Response(null, {
						status: 302,
						headers: {
							"Location": target + (query ? `?${query}` : ""),
							"Set-Cookie": await issueGateCookie(c),
							"Cache-Control": "no-store",
						},
					});
				}
				// unknown / spent key: behave like a missing page
				return notFoundPage(c.env.COPYRIGHT || "Not Found");
			}

			// the configured admin path needs a gate; every other /admin location
			// (including the default one after ADMIN_PATH was customized) is hidden
			const isAdminish = isAdminPagePath(url.pathname, adminPath)
				|| isAdminPagePath(url.pathname, "/admin");
			if (isAdminish) {
				const configured = isAdminPagePath(url.pathname, adminPath);
				if (!configured || !(await hasValidGate(c))) {
					return notFoundPage(c.env.COPYRIGHT || "Not Found");
				}
			}
			const indexUrl = new URL(url);
			indexUrl.pathname = "";
			indexUrl.search = "";
			const res = await c.env.ASSETS.fetch(indexUrl);
			const html = injectAdminPath(await res.text(), adminPath);
			const headers = new Headers(res.headers);
			headers.delete("ETag");
			headers.set("Content-Type", "text/html; charset=utf-8");
			return new Response(html, { status: res.status, headers });
		}

		return c.env.ASSETS.fetch(url);
	}

	// save language in context
	const lang = c.req.raw.headers.get("x-lang");
	if (lang) { c.set("lang", lang); }
	const msgs = i18n.getMessages(lang || c.env.DEFAULT_LANG);

	// check header x-custom-auth
	const passwords = getPasswords(c);
	if (!c.req.path.startsWith("/open_api")
		&& !c.req.path.startsWith("/telegram/")
		&& passwords && passwords.length > 0
	) {
		const auth = c.req.raw.headers.get("x-custom-auth");
		if (!auth || !passwords.includes(auth)) {
			return c.json({ code: ErrorCode.AUTH_SITE_PASSWORD_INVALID, message: msgs.CustomAuthPasswordMsg }, 401)
		}
	}

	// rate limit for specific endpoints
	if (
		c.req.path.startsWith("/api/new_address")
		|| c.req.path.startsWith("/api/send_mail")
		|| c.req.path.startsWith("/external/api/send_mail")
		|| (c.req.path.startsWith("/user_api/address/") && c.req.path.endsWith("/send_mail"))
		|| c.req.path.startsWith("/user_api/register")
		|| c.req.path.startsWith("/user_api/verify_code")
		|| c.req.path.startsWith("/redeem_api/")
		// P0 B2: burst cap on the login endpoints (15min/exponential lockout is
		// handled per-route in login_rate_limit.ts)
		|| c.req.path.startsWith("/open_api/site_login")
		|| c.req.path.startsWith("/open_api/admin_login")
		|| c.req.path.startsWith("/open_api/credential_login")
		|| c.req.path.startsWith("/user_api/login")
	) {
		const reqIp = c.req.raw.headers.get("cf-connecting-ip")
		if (reqIp && c.env.RATE_LIMITER) {
			const { success } = await c.env.RATE_LIMITER.limit(
				{ key: `${c.req.path}|${reqIp}` }
			)
			if (!success) {
				return c.text(`IP=${reqIp} Rate limit exceeded for ${c.req.path}`, 429)
			}
		}
		// Check access control (blacklist and daily limit)
		const accessControlResponse = await checkAccessControl(c);
		if (accessControlResponse) {
			return accessControlResponse;
		}
	}
	// webhook check
	if (
		c.req.path.startsWith("/api/webhook")
		|| c.req.path.startsWith("/admin/webhook")
		|| c.req.path.startsWith("/admin/mail_webhook")
	) {
		if (!c.env.KV) {
			return c.text(msgs.KVNotAvailableMsg, 400);
		}
		if (!getBooleanValue(c.env.ENABLE_WEBHOOK)) {
			return c.text(msgs.WebhookNotEnabledMsg, 403);
		}
	}
	if (!c.env.DB) {
		return c.text(msgs.DBNotAvailableMsg, 400);
	}
	if (!c.env.JWT_SECRET) {
		return c.text(msgs.JWTSecretNotSetMsg, 400);
	}
	await next()
});

const checkUserPayload = async (
	c: Context<HonoCustomType>
): Promise<void> => {
	try {
		const token = c.req.raw.headers.get("x-user-token");
		if (!token) return;
		const payload = await Jwt.verify(token, c.env.JWT_SECRET, "HS256");
		// check expired
		if (!payload.exp) return;
		// exp is in seconds
		if (payload.exp < Math.floor(Date.now() / 1000)) {
			return;
		}
		c.set("userPayload", payload as UserPayload);
	} catch (e) {
		console.error(e);
	}
}

const checkoutUserRolePayload = async (
	c: Context<HonoCustomType>,
	userId?: number
): Promise<Response | void> => {
	try {
		const token = c.req.raw.headers.get("x-user-access-token");
		if (!token) return;
		const payload = await Jwt.verify(token, c.env.JWT_SECRET, { alg: "HS256", exp: false });
		// check expired
		if (!payload.exp) return;
		// exp is in seconds
		if (payload.exp < Math.floor(Date.now() / 1000)) {
			return c.json({ code: ErrorCode.AUTH_USER_ACCESS_TOKEN_EXPIRED, message: i18n.getMessagesbyContext(c).UserAcceesTokenExpiredMsg }, 401);
		}
		if (typeof payload?.user_role !== "string") return;
		if (userId !== undefined && payload.user_id !== userId) return;
		c.set("userRolePayload", payload.user_role);
	} catch (e) {
		console.error(e);
	}
}

// api auth
app.use('/api/*', async (c, next) => {
	if (c.req.path.startsWith("/api/new_address")) {
		await checkUserPayload(c);
		await next();
		return;
	}
	if (c.req.path.startsWith("/api/settings")
		|| c.req.path.startsWith("/api/send_mail")
	) {
		const response = await checkoutUserRolePayload(c);
		if (response) return response;
	}
	if (c.req.path.startsWith("/api/address_login")) {
		await next();
		return;
	}

	try {
		return await addressJwtAuth(c, next);
	} catch (e) {
		console.warn(e);
		const lang = c.get("lang") || c.env.DEFAULT_LANG;
		const msgs = i18n.getMessages(lang);
		return c.text(msgs.InvalidAddressCredentialMsg, 401)
	}
});
// user_api auth
app.use('/user_api/*', async (c, next) => {
	if (
		c.req.path.startsWith("/user_api/open_settings")
		|| c.req.path.startsWith("/user_api/register")
		|| c.req.path.startsWith("/user_api/login")
		|| c.req.path.startsWith("/user_api/verify_code")
		|| c.req.path.startsWith("/user_api/passkey/authenticate_")
		|| c.req.path.startsWith("/user_api/oauth2")
	) {
		await next();
		return;
	}

	const lang = c.req.raw.headers.get("x-lang") || c.env.DEFAULT_LANG;
	const msgs = i18n.getMessages(lang);

	try {
		const token = c.req.raw.headers.get("x-user-token");
		if (!token) return c.text(msgs.UserTokenExpiredMsg, 401)
		const payload = await Jwt.verify(token, c.env.JWT_SECRET, "HS256");
		// check expired
		if (!payload.exp) return c.text(msgs.UserTokenExpiredMsg, 401);
		// exp is in seconds
		if (payload.exp < Math.floor(Date.now() / 1000)) {
			return c.text(msgs.UserTokenExpiredMsg, 401)
		}
		c.set("userPayload", payload as UserPayload);
	} catch (e) {
		console.error(e);
		return c.text(msgs.UserTokenExpiredMsg, 401)
	}
	if (
		c.req.path.startsWith("/user_api/bind_address")
		|| c.req.path.startsWith("/user_api/address/")
	) {
		const { user_id } = c.get("userPayload");
		const response = await checkoutUserRolePayload(c, user_id);
		if (response) return response;
	}
	if (c.req.path.startsWith('/user_api/bind_address')
		&& c.req.method === 'POST'
	) {
		return addressJwtAuth(c, next);
	}
	await next();
});
// admin auth
app.use('/admin/*', async (c, next) => {
	const lang = c.req.raw.headers.get("x-lang") || c.env.DEFAULT_LANG;
	const msgs = i18n.getMessages(lang);
	try {
		const ipWhitelist = getEnvStringList(c.env.ADMIN_API_IP_WHITELIST)
			.filter(ip => typeof ip === "string")
			.map(ip => ip.trim())
			.filter(Boolean);
		if (ipWhitelist.length > 0) {
			const reqIp = c.req.raw.headers.get("cf-connecting-ip")?.trim();
			if (!reqIp || !ipWhitelist.includes(reqIp)) {
				return c.text(msgs.AdminApiIpNotAllowedMsg, 403);
			}
		}
	} catch (e) {
		console.error("Failed to check admin API IP whitelist", e);
	}

	// P0-B3: try JWT auth first, fall back to legacy x-admin-auth
	if (await checkIsAdminWithJwt(c)) {
		await next();
		return;
	}
	// check if user is admin
	const access_token = c.req.raw.headers.get("x-user-access-token");
	if (c.env.ADMIN_USER_ROLE && access_token) {
		try {
			const payload = await Jwt.verify(access_token, c.env.JWT_SECRET, { alg: "HS256", exp: false });
			// check expired
			if (!payload.exp) return c.json({ code: ErrorCode.AUTH_ADMIN_CREDENTIAL_INVALID, message: msgs.UserAcceesTokenExpiredMsg }, 401);
			// exp is in seconds
			if (payload.exp < Math.floor(Date.now() / 1000)) {
				if (getBooleanValue(c.env.DISABLE_ADMIN_PASSWORD_CHECK)) return await next();
				return c.json({ code: ErrorCode.AUTH_USER_ACCESS_TOKEN_EXPIRED, message: msgs.UserAcceesTokenExpiredMsg }, 401);
			}
			if (payload.user_role !== c.env.ADMIN_USER_ROLE) {
				return c.json({ code: ErrorCode.AUTH_ADMIN_CREDENTIAL_INVALID, message: msgs.UserRoleIsNotAdminMsg }, 401)
			}
			await next();
			return;
		} catch (e) {
			console.error(e);
		}
	}

	// disable admin api check
	if (getBooleanValue(c.env.DISABLE_ADMIN_PASSWORD_CHECK)) {
		await next();
		return;
	}

	return c.json({ code: ErrorCode.AUTH_ADMIN_CREDENTIAL_INVALID, message: msgs.NeedAdminPasswordMsg }, 401)
});


app.route('/', commonApi)
app.route('/', openAuthApi)
app.route('/', mailsApi)
app.route('/', userApi)
app.route('/', adminApi)
app.route('/', apiSendMail)
app.route('/', telegramApi)
app.route('/', redeemApi)

const health_check = async (c: Context<HonoCustomType>) => {
	const lang = c.req.raw.headers.get("x-lang") || c.env.DEFAULT_LANG;
	const msgs = i18n.getMessages(lang);
	if (!c.env.DB) {
		return c.text(msgs.DBNotAvailableMsg, 400);
	}
	if (!c.env.JWT_SECRET) {
		return c.text(msgs.JWTSecretNotSetMsg, 400);
	}
	if (getDomains(c).length === 0) {
		return c.text(msgs.DomainsNotSetMsg, 400);
	}
	return c.text("OK");
}

app.get('/', health_check)
app.get('/health_check', health_check)
app.all('/*', async c => c.text("Not Found", 404))


export default {
	fetch: app.fetch,
	email: email,
	scheduled: scheduled,
}
