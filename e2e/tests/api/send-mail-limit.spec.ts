import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  WORKER_URL,
  WORKER_URL_SEND_MAIL_DOMAIN,
  TEST_DOMAIN,
  createTestAddress,
  deleteAddress,
  deleteAllMailpitMessages,
  requestSendAccess,
  onMailpitMessage,
} from '../../fixtures/test-helpers';

const ADMIN_PASSWORD = 'e2e-admin-pass';
const ADMIN_HEADERS = { 'x-admin-auth': ADMIN_PASSWORD };

const DEFAULT_ACCOUNT_SETTINGS = {
  blockList: [],
  sendBlockList: [],
  verifiedAddressList: [],
  fromBlockList: [],
  noLimitSendAddressList: [],
  emailRuleSettings: {},
  addressCreationSettings: {},
};

const DISABLED_LIMIT_CONFIG = {
  dailyEnabled: false,
  monthlyEnabled: false,
  dailyLimit: null as number | null,
  monthlyLimit: null as number | null,
};

async function saveLimitConfig(
  request: APIRequestContext,
  sendMailLimitConfig: Record<string, unknown>
) {
  return request.post(`${WORKER_URL}/admin/account_settings`, {
    headers: ADMIN_HEADERS,
    data: { ...DEFAULT_ACCOUNT_SETTINGS, sendMailLimitConfig },
  });
}

async function resetLimitConfig(request: APIRequestContext) {
  const res = await saveLimitConfig(request, DISABLED_LIMIT_CONFIG);
  expect(res.ok()).toBe(true);
}

async function sendOneMail(
  request: APIRequestContext,
  jwt: string,
  tag: string,
  opts: { expectDelivery?: boolean; lang?: string } = {}
) {
  const { expectDelivery = true, lang } = opts;
  const subject = `limit-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${jwt}` };
  if (lang) headers['x-lang'] = lang;

  let listener: ReturnType<typeof onMailpitMessage> | undefined;
  if (expectDelivery) {
    listener = onMailpitMessage((m) => m.Subject === subject);
    await listener.ready;
  }
  const res = await request.post(`${WORKER_URL}/api/send_mail`, {
    headers,
    data: {
      from_name: 'Limit E2E',
      to_name: 'Recipient',
      to_mail: 'recipient@test.example.com',
      subject,
      content: `Limit test body ${tag}`,
      is_html: false,
    },
  });
  return { res, listener, subject };
}

async function probeLimitBaseline(
  request: APIRequestContext,
  jwt: string,
  config: {
    dailyEnabled: boolean;
    monthlyEnabled: boolean;
    dailyLimit: number | null;
    monthlyLimit: number | null;
  },
  subjectPrefix: string,
  maxProbeLimit: number = 50
): Promise<number> {
  for (let limit = 1; limit <= maxProbeLimit; limit++) {
    const save = await saveLimitConfig(request, {
      ...config,
      dailyLimit: config.dailyEnabled ? limit : null,
      monthlyLimit: config.monthlyEnabled ? limit : null,
    });
    expect(save.ok()).toBe(true);

    const probe = await request.post(`${WORKER_URL}/api/send_mail`, {
      headers: { Authorization: `Bearer ${jwt}` },
      data: {
        from_name: 'probe',
        to_name: '',
        to_mail: 'recipient@test.example.com',
        subject: `${subjectPrefix}-${limit}-${Date.now()}`,
        content: 'probe',
        is_html: false,
      },
    });
    if (probe.ok()) {
      return limit;
    }
  }
  throw new Error(`Failed to probe send mail limit baseline within ${maxProbeLimit}`);
}

async function probeDailyBaseline(
  request: APIRequestContext,
  jwt: string
): Promise<number> {
  return probeLimitBaseline(request, jwt, {
    dailyEnabled: true,
    monthlyEnabled: false,
    dailyLimit: 1,
    monthlyLimit: null,
  }, 'probe-daily');
}

async function probeMonthlyBaseline(
  request: APIRequestContext,
  jwt: string
): Promise<number> {
  return probeLimitBaseline(request, jwt, {
    dailyEnabled: false,
    monthlyEnabled: true,
    dailyLimit: null,
    monthlyLimit: 1,
  }, 'probe-monthly');
}

test.describe('Send Mail Limit', () => {
  test.beforeEach(async ({ request }) => {
    await deleteAllMailpitMessages(request);
    await resetLimitConfig(request);
  });

  test.afterEach(async ({ request }) => {
    await resetLimitConfig(request);
  });

  test('save + read roundtrip preserves all fields', async ({ request }) => {
    const config = {
      dailyEnabled: true,
      monthlyEnabled: true,
      dailyLimit: 7,
      monthlyLimit: 1234,
    };
    const save = await saveLimitConfig(request, config);
    expect(save.ok()).toBe(true);

    const read = await request.get(`${WORKER_URL}/admin/account_settings`, {
      headers: ADMIN_HEADERS,
    });
    expect(read.ok()).toBe(true);
    const body = await read.json();
    expect(body.sendMailLimitConfig).toEqual(config);
  });

  test('disabled flags coerce numeric limits to null', async ({ request }) => {
    const save = await saveLimitConfig(request, {
      dailyEnabled: false,
      monthlyEnabled: false,
      dailyLimit: 10,
      monthlyLimit: 20,
    });
    expect(save.ok()).toBe(true);

    const read = await request.get(`${WORKER_URL}/admin/account_settings`, {
      headers: ADMIN_HEADERS,
    });
    const body = await read.json();
    expect(body.sendMailLimitConfig).toEqual(DISABLED_LIMIT_CONFIG);
  });

  test('minus one is accepted as unlimited', async ({ request }) => {
    const config = {
      dailyEnabled: true,
      monthlyEnabled: true,
      dailyLimit: -1,
      monthlyLimit: -1,
    };
    const save = await saveLimitConfig(request, config);
    expect(save.ok()).toBe(true);

    const read = await request.get(`${WORKER_URL}/admin/account_settings`, {
      headers: ADMIN_HEADERS,
    });
    const body = await read.json();
    expect(body.sendMailLimitConfig).toEqual(config);
  });

  test('invalid payloads rejected with 400', async ({ request }) => {
    const cases: Array<Record<string, unknown>> = [
      { dailyEnabled: 'yes', monthlyEnabled: false, dailyLimit: null, monthlyLimit: null },
      { dailyEnabled: true, monthlyEnabled: false, dailyLimit: -2, monthlyLimit: null },
      { dailyEnabled: true, monthlyEnabled: false, dailyLimit: 1.5, monthlyLimit: null },
      { dailyEnabled: true, monthlyEnabled: false, dailyLimit: null, monthlyLimit: null },
      { dailyEnabled: false, monthlyEnabled: true, dailyLimit: null, monthlyLimit: null },
    ];
    for (const bad of cases) {
      const res = await saveLimitConfig(request, bad);
      expect(res.status(), `payload: ${JSON.stringify(bad)}`).toBe(400);
    }
  });

  test('disabled limit allows unlimited sends', async ({ request }) => {
    const { jwt } = await createTestAddress(request, 'limit-off');
    await requestSendAccess(request, jwt);
    await resetLimitConfig(request);

    for (let i = 0; i < 3; i++) {
      const { res, listener } = await sendOneMail(request, jwt, `off${i}`);
      expect(res.ok()).toBe(true);
      await listener!.message;
    }
    await deleteAddress(request, jwt);
  });

  test('zero limit blocks sending immediately', async ({ request }) => {
    const { jwt } = await createTestAddress(request, 'limit-zero');
    await requestSendAccess(request, jwt);

    const save = await saveLimitConfig(request, {
      dailyEnabled: true,
      monthlyEnabled: false,
      dailyLimit: 0,
      monthlyLimit: null,
    });
    expect(save.ok()).toBe(true);

    const { res } = await sendOneMail(request, jwt, 'zero', {
      expectDelivery: false,
    });
    expect(res.ok()).toBe(false);
    const text = await res.text();
    expect(text).toContain('Server daily send quota has been reached');

    await deleteAddress(request, jwt);
  });

  test('daily limit blocks once reached and returns English message', async ({ request }) => {
    const { jwt } = await createTestAddress(request, 'limit-daily');
    await requestSendAccess(request, jwt);

    const baseline = await probeDailyBaseline(request, jwt);
    const allowed = 2;
    const limit = baseline + allowed;

    const save = await saveLimitConfig(request, {
      dailyEnabled: true,
      monthlyEnabled: false,
      dailyLimit: limit,
      monthlyLimit: null,
    });
    expect(save.ok()).toBe(true);

    for (let i = 0; i < allowed; i++) {
      const { res, listener } = await sendOneMail(request, jwt, `d${i}`);
      expect(res.ok(), `send #${i} should succeed`).toBe(true);
      await listener!.message;
    }

    const { res: blocked } = await sendOneMail(request, jwt, 'd-over', {
      expectDelivery: false,
    });
    expect(blocked.ok()).toBe(false);
    const text = await blocked.text();
    expect(text).toContain('Server daily send quota has been reached');

    await deleteAddress(request, jwt);
  });

  test('monthly limit blocks once reached', async ({ request }) => {
    const { jwt } = await createTestAddress(request, 'limit-monthly');
    await requestSendAccess(request, jwt);

    const baseline = await probeMonthlyBaseline(request, jwt);
    const allowed = 2;
    const limit = baseline + allowed;

    const save = await saveLimitConfig(request, {
      dailyEnabled: false,
      monthlyEnabled: true,
      dailyLimit: null,
      monthlyLimit: limit,
    });
    expect(save.ok()).toBe(true);

    for (let i = 0; i < allowed; i++) {
      const { res, listener } = await sendOneMail(request, jwt, `m${i}`);
      expect(res.ok(), `send #${i} should succeed`).toBe(true);
      await listener!.message;
    }

    const { res: blocked } = await sendOneMail(request, jwt, 'm-over', {
      expectDelivery: false,
    });
    expect(blocked.ok()).toBe(false);
    const text = await blocked.text();
    expect(text).toContain('Server monthly send quota has been reached');

    await deleteAddress(request, jwt);
  });

  test('zh-lang header returns Chinese daily limit message', async ({ request }) => {
    const { jwt } = await createTestAddress(request, 'limit-zh');
    await requestSendAccess(request, jwt);

    const baseline = await probeDailyBaseline(request, jwt);
    const save = await saveLimitConfig(request, {
      dailyEnabled: true,
      monthlyEnabled: false,
      dailyLimit: baseline,
      monthlyLimit: null,
    });
    expect(save.ok()).toBe(true);

    const { res } = await sendOneMail(request, jwt, 'zh-over', {
      expectDelivery: false,
      lang: 'zh',
    });
    expect(res.ok()).toBe(false);
    const text = await res.text();
    expect(text).toContain('服务器今日发信次数已达上限');

    await deleteAddress(request, jwt);
  });

  test('validation failures (missing subject) do not consume quota', async ({ request }) => {
    const { jwt } = await createTestAddress(request, 'limit-noconsume');
    await requestSendAccess(request, jwt);

    const baseline = await probeDailyBaseline(request, jwt);
    const save = await saveLimitConfig(request, {
      dailyEnabled: true,
      monthlyEnabled: false,
      dailyLimit: baseline + 1,
      monthlyLimit: null,
    });
    expect(save.ok()).toBe(true);

    // Empty subject → rejected by validation BEFORE the counter increments.
    const badRes = await request.post(`${WORKER_URL}/api/send_mail`, {
      headers: { Authorization: `Bearer ${jwt}` },
      data: {
        from_name: '',
        to_name: '',
        to_mail: 'recipient@test.example.com',
        subject: '',
        content: 'no subject',
        is_html: false,
      },
    });
    expect(badRes.ok()).toBe(false);

    const { res, listener } = await sendOneMail(request, jwt, 'after-bad');
    expect(res.ok()).toBe(true);
    await listener!.message;

    await deleteAddress(request, jwt);
  });

  test('both daily + monthly enabled: tighter daily limit wins', async ({ request }) => {
    const { jwt } = await createTestAddress(request, 'limit-both');
    await requestSendAccess(request, jwt);

    const baseline = await probeDailyBaseline(request, jwt);
    const save = await saveLimitConfig(request, {
      dailyEnabled: true,
      monthlyEnabled: true,
      dailyLimit: baseline,
      monthlyLimit: baseline + 10_000,
    });
    expect(save.ok()).toBe(true);

    const { res } = await sendOneMail(request, jwt, 'both-over', {
      expectDelivery: false,
    });
    expect(res.ok()).toBe(false);
    const text = await res.text();
    expect(text).toContain('Server daily send quota has been reached');

    await deleteAddress(request, jwt);
  });

  test('minus one means unlimited at runtime', async ({ request }) => {
    const { jwt } = await createTestAddress(request, 'limit-unlimited');
    await requestSendAccess(request, jwt);

    const save = await saveLimitConfig(request, {
      dailyEnabled: true,
      monthlyEnabled: true,
      dailyLimit: -1,
      monthlyLimit: -1,
    });
    expect(save.ok()).toBe(true);

    for (let i = 0; i < 3; i++) {
      const { res, listener } = await sendOneMail(request, jwt, `unl${i}`);
      expect(res.ok(), `send #${i} should succeed`).toBe(true);
      await listener!.message;
    }

    await deleteAddress(request, jwt);
  });

  test('/admin/send_mail_by_binding returns 400 when SEND_MAIL binding is missing', async ({ request }) => {
    const res = await request.post(`${WORKER_URL}/admin/send_mail_by_binding`, {
      headers: ADMIN_HEADERS,
      data: {
        from: 'admin@test.example.com',
        to: ['recipient@test.example.com'],
        subject: 'no-binding',
        text: 'body',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('/admin/send_mail_by_binding normalizes uppercase allowed domain', async ({ request }) => {
    const res = await request.post(`${WORKER_URL_SEND_MAIL_DOMAIN}/admin/send_mail_by_binding`, {
      headers: ADMIN_HEADERS,
      data: {
        from: 'admin@TEST.EXAMPLE.COM',
        to: ['recipient@test.example.com'],
        subject: `send-mail-domain-ok-${Date.now()}`,
        text: 'body',
      },
    });
    expect(res.ok()).toBe(true);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('/admin/send_mail_by_binding normalizes object-form from domain', async ({ request }) => {
    const res = await request.post(`${WORKER_URL_SEND_MAIL_DOMAIN}/admin/send_mail_by_binding`, {
      headers: ADMIN_HEADERS,
      data: {
        from: { email: 'admin@TEST.EXAMPLE.COM', name: 'Admin' },
        to: ['recipient@test.example.com'],
        subject: `send-mail-domain-object-ok-${Date.now()}`,
        text: 'body',
      },
    });
    expect(res.ok()).toBe(true);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('/admin/send_mail_by_binding returns 400 when domain is not allowed', async ({ request }) => {
    const res = await request.post(`${WORKER_URL_SEND_MAIL_DOMAIN}/admin/send_mail_by_binding`, {
      headers: ADMIN_HEADERS,
      data: {
        from: 'admin@blocked.example.com',
        to: ['recipient@test.example.com'],
        subject: `send-mail-domain-blocked-${Date.now()}`,
        text: 'body',
      },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain('Please enable SEND_MAIL for this domain first');
  });

  test('daily and monthly counters both increment on successful send', async ({ request }) => {
    const { jwt } = await createTestAddress(request, 'limit-both-inc');
    await requestSendAccess(request, jwt);

    const dailyBaseline = await probeDailyBaseline(request, jwt);
    const monthlyBaseline = await probeMonthlyBaseline(request, jwt);

    // Give plenty of headroom so sends succeed.
    const save = await saveLimitConfig(request, {
      dailyEnabled: true,
      monthlyEnabled: true,
      dailyLimit: dailyBaseline + 10,
      monthlyLimit: monthlyBaseline + 10,
    });
    expect(save.ok()).toBe(true);

    const { res, listener } = await sendOneMail(request, jwt, 'inc');
    expect(res.ok()).toBe(true);
    await listener!.message;

    // Re-probe to confirm both counters moved forward after the successful send.
    const dailyAfter = await probeDailyBaseline(request, jwt);
    expect(dailyAfter).toBeGreaterThanOrEqual(dailyBaseline + 1);
    const monthlyAfter = await probeMonthlyBaseline(request, jwt);
    expect(monthlyAfter).toBeGreaterThanOrEqual(monthlyBaseline + 1);

    await deleteAddress(request, jwt);
  });

  test('admin /admin/send_mail also respects daily limit', async ({ request }) => {
    const { jwt, address } = await createTestAddress(request, 'limit-admin');
    await requestSendAccess(request, jwt);

    // Probe via a user-facing send to establish baseline.
    const baseline = await probeDailyBaseline(request, jwt);
    const save = await saveLimitConfig(request, {
      dailyEnabled: true,
      monthlyEnabled: false,
      dailyLimit: baseline,
      monthlyLimit: null,
    });
    expect(save.ok()).toBe(true);

    const res = await request.post(`${WORKER_URL}/admin/send_mail`, {
      headers: ADMIN_HEADERS,
      data: {
        from_name: '',
        from_mail: address,
        to_name: '',
        to_mail: 'recipient@test.example.com',
        subject: `admin-over-${Date.now()}`,
        content: 'admin blocked body',
        is_html: false,
      },
    });
    expect(res.ok()).toBe(false);
    const text = await res.text();
    expect(text).toContain('Server daily send quota has been reached');

    await deleteAddress(request, jwt);
  });
});

// ---------------------------------------------------------------------------
// Send switches layer 2: the admin domain list.
//
// The admin domain list is the per-domain layer of the send switches: a
// read-only channel report (derived from env only — keys are never stored) and
// optional per-domain daily/monthly limits. Blank limits inherit the global
// ones; global and per-domain limits both apply, and per-domain counters are
// kept separately. Only managed domains can carry per-domain overrides.
//
// The e2e worker wires SMTP_CONFIG for TEST_DOMAIN to mailpit, so at least one
// channel is always usable here.
// ---------------------------------------------------------------------------

async function getManagedDomain(request: APIRequestContext, name: string) {
  const res = await request.get(`${WORKER_URL}/admin/domains`, {
    headers: ADMIN_HEADERS,
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  return (body.domains || []).find((item: any) => item.name === name);
}

/** Add TEST_DOMAIN to the managed list when missing (kept for later tests). */
async function ensureManagedDomain(request: APIRequestContext) {
  const existing = await getManagedDomain(request, TEST_DOMAIN);
  if (existing) {
    return existing;
  }
  const add = await request.post(`${WORKER_URL}/admin/domains`, {
    headers: ADMIN_HEADERS,
    data: { name: TEST_DOMAIN },
  });
  expect(add.ok(), `failed to add ${TEST_DOMAIN}: ${await add.text()}`).toBe(true);
  const added = await add.json();
  return (added.domains || []).find((item: any) => item.name === TEST_DOMAIN);
}

function patchDomain(
  request: APIRequestContext,
  name: string,
  data: Record<string, unknown>
) {
  return request.patch(`${WORKER_URL}/admin/domains/${name}`, {
    headers: ADMIN_HEADERS,
    data,
  });
}

/** Restore "inherit the global limits" + "send enabled" for TEST_DOMAIN. */
async function resetDomainOverrides(request: APIRequestContext) {
  const res = await patchDomain(request, TEST_DOMAIN, {
    sendDailyLimit: null,
    sendMonthlyLimit: null,
    sendEnabled: true,
  });
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`failed to reset domain overrides: ${res.status()} ${await res.text()}`);
  }
}

/**
 * Smallest per-domain limit that still lets one send through (= count + 1).
 * Used instead of assuming a clean counter, because the per-domain counters
 * live in the shared test database.
 */
async function probeDomainBaseline(
  request: APIRequestContext,
  jwt: string,
  key: 'sendDailyLimit' | 'sendMonthlyLimit',
  maxProbeLimit: number = 50
): Promise<number> {
  for (let limit = 1; limit <= maxProbeLimit; limit++) {
    const save = await patchDomain(request, TEST_DOMAIN, { [key]: limit });
    expect(save.ok()).toBe(true);

    const probe = await request.post(`${WORKER_URL}/api/send_mail`, {
      headers: { Authorization: `Bearer ${jwt}` },
      data: {
        from_name: 'probe',
        to_name: '',
        to_mail: 'recipient@test.example.com',
        subject: `probe-domain-${key}-${limit}-${Date.now()}`,
        content: 'probe',
        is_html: false,
      },
    });
    if (probe.ok()) {
      return limit;
    }
  }
  throw new Error(`Failed to probe per-domain baseline within ${maxProbeLimit}`);
}

async function sendOneMailInline(request: APIRequestContext, jwt: string, tag: string) {
  return request.post(`${WORKER_URL}/api/send_mail`, {
    headers: { Authorization: `Bearer ${jwt}` },
    data: {
      from_name: 'Domain Layer E2E',
      to_name: 'Recipient',
      to_mail: 'recipient@test.example.com',
      subject: `domain-layer-${tag}-${Date.now()}`,
      content: `Domain layer test body ${tag}`,
      is_html: false,
    },
  });
}

test.describe('Send switches layer 2 (per-domain channel report + limits)', () => {
  test.beforeEach(async ({ request }) => {
    await deleteAllMailpitMessages(request);
    // Global layer stays unlimited: only the per-domain layer is under test.
    await resetLimitConfig(request);
  });

  test.afterEach(async ({ request }) => {
    await resetLimitConfig(request);
    await resetDomainOverrides(request);
  });

  test('domain list reports env channels and inherits limits by default', async ({ request }) => {
    const domain = await ensureManagedDomain(request);
    expect(domain.channels, 'channels report is missing').toBeTruthy();

    for (const key of ['resend', 'smtp', 'binding']) {
      expect(typeof domain.channels[key], `channels.${key}`).toBe('boolean');
    }

    // effective must be the first available channel in delivery priority order
    const expected = domain.channels.resend
      ? 'resend'
      : domain.channels.smtp
        ? 'smtp'
        : domain.channels.binding
          ? 'binding'
          : 'none';
    expect(domain.channels.effective).toBe(expected);
    expect(domain.channels.effective).not.toBe('none');

    // limits are unset by default => they inherit the global config
    expect(domain.sendDailyLimit).toBe(null);
    expect(domain.sendMonthlyLimit).toBe(null);
  });

  test('per-domain limits round-trip, validate and reset to inherit', async ({ request }) => {
    await ensureManagedDomain(request);

    const save = await patchDomain(request, TEST_DOMAIN, {
      sendDailyLimit: 5,
      sendMonthlyLimit: 50,
    });
    expect(save.ok()).toBe(true);
    const saved = (await save.json()).domains.find((item: any) => item.name === TEST_DOMAIN);
    expect(saved.sendDailyLimit).toBe(5);
    expect(saved.sendMonthlyLimit).toBe(50);

    for (const bad of [0, -1, 1.5, '5', 100001, true]) {
      const res = await patchDomain(request, TEST_DOMAIN, { sendDailyLimit: bad });
      expect(res.status(), `value: ${JSON.stringify(bad)}`).toBe(400);
    }

    const reset = await patchDomain(request, TEST_DOMAIN, {
      sendDailyLimit: null,
      sendMonthlyLimit: null,
    });
    expect(reset.ok()).toBe(true);
    const cleared = (await reset.json()).domains.find((item: any) => item.name === TEST_DOMAIN);
    expect(cleared.sendDailyLimit).toBe(null);
    expect(cleared.sendMonthlyLimit).toBe(null);
  });

  test('unmanaged domains cannot carry a per-domain limit', async ({ request }) => {
    const res = await patchDomain(request, 'not-managed.example.com', { sendDailyLimit: 1 });
    expect(res.status()).toBe(404);
  });

  test('per-domain send switch off blocks that domain and back on restores it', async ({ request }) => {
    await ensureManagedDomain(request);
    const { jwt } = await createTestAddress(request, 'domain-send-off');
    await requestSendAccess(request, jwt);

    try {
      const off = await patchDomain(request, TEST_DOMAIN, { sendEnabled: false });
      expect(off.ok()).toBe(true);

      const blocked = await sendOneMailInline(request, jwt, 'switch-off');
      expect(blocked.ok()).toBe(false);
      expect(await blocked.text()).toContain('Sending is disabled for this domain');

      const on = await patchDomain(request, TEST_DOMAIN, { sendEnabled: true });
      expect(on.ok()).toBe(true);

      const restored = await sendOneMailInline(request, jwt, 'switch-on');
      expect(restored.ok()).toBe(true);
    } finally {
      await deleteAddress(request, jwt);
    }
  });

  test('per-domain daily limit blocks sends and clearing it restores sending', async ({ request }) => {
    await ensureManagedDomain(request);
    const { jwt } = await createTestAddress(request, 'domain-limit-daily');
    await requestSendAccess(request, jwt);

    try {
      const baseline = await probeDomainBaseline(request, jwt, 'sendDailyLimit');
      const save = await patchDomain(request, TEST_DOMAIN, { sendDailyLimit: baseline + 1 });
      expect(save.ok()).toBe(true);

      const allowed = await sendOneMailInline(request, jwt, 'daily-allowed');
      expect(allowed.ok(), 'the send within the per-domain limit should succeed').toBe(true);

      const blocked = await sendOneMailInline(request, jwt, 'daily-blocked');
      expect(blocked.ok()).toBe(false);
      expect(await blocked.text()).toContain('Server daily send quota has been reached');

      // inherit the global limit again => the per-domain counter no longer applies
      const cleared = await patchDomain(request, TEST_DOMAIN, { sendDailyLimit: null });
      expect(cleared.ok()).toBe(true);

      const restored = await sendOneMailInline(request, jwt, 'daily-restored');
      expect(restored.ok(), 'clearing the per-domain limit should restore sending').toBe(true);
    } finally {
      await deleteAddress(request, jwt);
    }
  });

  test('per-domain monthly limit blocks sends', async ({ request }) => {
    await ensureManagedDomain(request);
    const { jwt } = await createTestAddress(request, 'domain-limit-monthly');
    await requestSendAccess(request, jwt);

    try {
      const baseline = await probeDomainBaseline(request, jwt, 'sendMonthlyLimit');
      const save = await patchDomain(request, TEST_DOMAIN, { sendMonthlyLimit: baseline + 1 });
      expect(save.ok()).toBe(true);

      const allowed = await sendOneMailInline(request, jwt, 'monthly-allowed');
      expect(allowed.ok(), 'the send within the per-domain limit should succeed').toBe(true);

      const blocked = await sendOneMailInline(request, jwt, 'monthly-blocked');
      expect(blocked.ok()).toBe(false);
      expect(await blocked.text()).toContain('Server monthly send quota has been reached');
    } finally {
      await deleteAddress(request, jwt);
    }
  });
});
