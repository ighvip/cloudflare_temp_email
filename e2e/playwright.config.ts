import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const WORKER_BASE = process.env.WORKER_URL!;
const WORKER_GZIP_BASE = process.env.WORKER_GZIP_URL || '';
const FRONTEND_BASE = process.env.FRONTEND_URL!;

// P0-B4 admin gate: scripts/gate-setup.mjs registers one shared session S in
// every worker and writes the storageState that carries the `admin_gate`
// cookie; S doubles as the `x-gate-tab` per-tab token. Without a provisioned
// run both stay off and /admin/* requests behave as before (404).
const gateStateFile = process.env.GATE_STATE_FILE
  || fileURLToPath(new URL('./.gate-state.json', import.meta.url));
const gateUse = {
  ...(process.env.GATE_SESSION ? { extraHTTPHeaders: { 'x-gate-tab': process.env.GATE_SESSION } } : {}),
  ...(existsSync(gateStateFile) ? { storageState: gateStateFile } : {}),
};

export default defineConfig({
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        baseURL: WORKER_BASE,
        ...gateUse,
      },
    },
    {
      name: 'api-gzip',
      testDir: './tests/api-gzip',
      use: {
        baseURL: WORKER_GZIP_BASE,
        ...gateUse,
      },
    },
    {
      name: 'smtp-proxy',
      testDir: './tests/smtp-proxy',
      use: {
        baseURL: WORKER_BASE,
        ...gateUse,
      },
    },
    {
      name: 'browser',
      testDir: './tests/browser',
      use: {
        baseURL: FRONTEND_BASE,
        ...gateUse,
        ...devices['Desktop Chrome'],
        // Accept self-signed cert from Docker frontend (HTTPS for WebAuthn)
        ignoreHTTPSErrors: true,
      },
    },
  ],
});
