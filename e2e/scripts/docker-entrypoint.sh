#!/usr/bin/env bash
set -euo pipefail

echo "==> Waiting for worker at $WORKER_URL ..."
for i in $(seq 1 60); do
  if curl -sf "$WORKER_URL/health_check" > /dev/null 2>&1; then
    echo "    Worker ready after ${i}s"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: Worker not ready after 60s"
    exit 1
  fi
  sleep 1
done

if [ -n "${WORKER_URL_SUBDOMAIN:-}" ]; then
  echo "==> Waiting for subdomain worker at $WORKER_URL_SUBDOMAIN ..."
  for i in $(seq 1 60); do
    if curl -sf "$WORKER_URL_SUBDOMAIN/health_check" > /dev/null 2>&1; then
      echo "    Subdomain worker ready after ${i}s"
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "ERROR: Subdomain worker not ready after 60s"
      exit 1
    fi
    sleep 1
  done
fi

if [ -n "${WORKER_URL_ENV_OFF:-}" ]; then
  echo "==> Waiting for env-off worker at $WORKER_URL_ENV_OFF ..."
  for i in $(seq 1 60); do
    if curl -sf "$WORKER_URL_ENV_OFF/health_check" > /dev/null 2>&1; then
      echo "    Env-off worker ready after ${i}s"
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "ERROR: Env-off worker not ready after 60s"
      exit 1
    fi
    sleep 1
  done
fi

if [ -n "${WORKER_GZIP_URL:-}" ]; then
  echo "==> Waiting for worker-gzip at $WORKER_GZIP_URL ..."
  for i in $(seq 1 60); do
    if curl -sf "$WORKER_GZIP_URL/health_check" > /dev/null 2>&1; then
      echo "    Worker-gzip ready after ${i}s"
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "ERROR: Worker-gzip not ready after 60s"
      exit 1
    fi
    sleep 1
  done
fi

if [ -n "${WORKER_URL_SITE_PASSWORD:-}" ]; then
  echo "==> Waiting for site-password worker at $WORKER_URL_SITE_PASSWORD ..."
  for i in $(seq 1 60); do
    if curl --connect-timeout 5 --max-time 10 -sf -H "x-custom-auth: e2e-site-pass" "$WORKER_URL_SITE_PASSWORD/health_check" > /dev/null 2>&1; then
      echo "    Site-password worker ready after ${i}s"
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "ERROR: Site-password worker not ready after 60s"
      exit 1
    fi
    sleep 1
  done
fi

echo "==> Waiting for frontend at $FRONTEND_URL ..."
for i in $(seq 1 60); do
  if curl -skf "$FRONTEND_URL" > /dev/null 2>&1; then
    echo "    Frontend ready after ${i}s"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: Frontend not ready after 60s"
    exit 1
  fi
  sleep 1
done

if [ -n "${FRONTEND_URL_ENV_OFF:-}" ]; then
  echo "==> Waiting for env-off frontend at $FRONTEND_URL_ENV_OFF ..."
  for i in $(seq 1 60); do
    if curl --connect-timeout 5 --max-time 10 -skf "$FRONTEND_URL_ENV_OFF" > /dev/null 2>&1; then
      echo "    Env-off frontend ready after ${i}s"
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "ERROR: Env-off frontend not ready after 60s"
      exit 1
    fi
    sleep 1
  done
fi

echo "==> Waiting for smtp-proxy-tls SMTP on $SMTP_PROXY_TLS_HOST:$SMTP_PROXY_TLS_SMTP_PORT ..."
for i in $(seq 1 30); do
  if nc -z "$SMTP_PROXY_TLS_HOST" "$SMTP_PROXY_TLS_SMTP_PORT" 2>/dev/null; then
    echo "    smtp-proxy-tls SMTP ready after ${i}s"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "WARNING: smtp-proxy-tls SMTP not ready after 30s, continuing anyway"
  fi
  sleep 1
done

echo "==> Provisioning admin gate + database"
# P0-B4: /admin/* is gated (cookie + x-gate-tab), so the old bare
# `curl /admin/db_initialize` calls would 404. gate-setup.mjs bootstraps the
# tables via /__test, registers one shared gate session in every worker and
# verifies it through the real /admin/db_migration route; it prints the
# session for the runner to export (storageState + x-gate-tab).
export GATE_STATE_FILE="$(cd "$(dirname "$0")/.." && pwd)/.gate-state.json"
export GATE_SESSION=$(node "$(dirname "$0")/gate-setup.mjs")
echo "    Gate session provisioned"

echo "==> Running Playwright tests"
npm run test:unit
exec npx playwright test "$@"
