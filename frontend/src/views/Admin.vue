<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'

import { useGlobalState } from '../store'
import { api } from '../api'
import { getRouterPathWithLang, hashPassword } from '../utils'
import { getGateSession, clearGateSession } from '../utils/gate'
import Turnstile from '../components/Turnstile.vue'

import SenderAccess from './admin/SenderAccess.vue'
import Statistics from "./admin/Statistics.vue"
import SendBox from './admin/SendBox.vue';
import Account from './admin/Account.vue';
import CreateAccount from './admin/CreateAccount.vue';
import AccountSettings from './admin/AccountSettings.vue';
import UserManagement from './admin/UserManagement.vue';
import UserSettings from './admin/UserSettings.vue';
import UserOauth2Settings from './admin/UserOauth2Settings.vue';
import RoleAddressConfig from './admin/RoleAddressConfig.vue';
import Mails from './admin/Mails.vue';
import MailsUnknow from './admin/MailsUnknow.vue';
import About from './common/About.vue';
import Maintenance from './admin/Maintenance.vue';
import DatabaseManager from './admin/DatabaseManager.vue';
import Appearance from './common/Appearance.vue';
import Telegram from './admin/Telegram.vue';
import Webhook from './admin/Webhook.vue';
import MailWebhook from './admin/MailWebhook.vue';
import WorkerConfig from './admin/WorkerConfig.vue';
import SiteSettings from './admin/SiteSettings.vue';
import IpBlacklistSettings from './admin/IpBlacklistSettings.vue';
import AiExtractSettings from './admin/AiExtractSettings.vue';
import RedeemCodes from './admin/RedeemCodes.vue';
import SecuritySettings from './admin/SecuritySettings.vue';

const {
  adminAuth, showAdminAuth, adminTab, loading,
  globalTabplacement, showAdminPage, userSettings,
  openSettings, adminJwt
} = useGlobalState()
const message = useMessage()
const router = useRouter()

const SendMail = defineAsyncComponent(() => {
  loading.value = true;
  return import('./admin/SendMail.vue')
    .finally(() => loading.value = false);
});

const cfToken = ref('')
const turnstileRef = ref(null)

// P0-B4 rework: without the per-tab session token (only obtainable through
// the homepage one-time token) the admin page renders the branded 404
const gateOk = ref(!!getGateSession())

// sessionStorage is cleared *before* any reload so a dead session cannot
// cause a reload loop — the next load renders the 404 above
const handleGateDeath = () => {
  clearGateSession()
  window.location.reload()
}

// ---- heartbeat: refreshes the session's last_seen so the server keeps the
// window alive; closing the tab stops it and the session expires (120s)
let gateHeartbeatTimer = null
const pingGate = async () => {
  if (!gateOk.value) return
  try {
    await api.fetch('/open_api/admin_gate_ping', { method: 'POST', showLoading: false })
  } catch (error) {
    if (error?.status === 404) handleGateDeath()
  }
}
const onVisibilityChange = () => {
  if (!document.hidden) pingGate()
}

const authFunc = async () => {
  try {
    const res = await api.fetch('/open_api/admin_login', {
      method: 'POST',
      body: JSON.stringify({
        password: await hashPassword(tmpAdminAuth.value),
        cf_token: cfToken.value
      })
    });
    if (res && res.admin_token) {
      adminJwt.value = res.admin_token;
    }
    adminAuth.value = tmpAdminAuth.value;
    location.reload()
  } catch (error) {
    message.error(error.message || "error");
    turnstileRef.value?.refresh?.();
  }
}

const showLogoutModal = ref(false)

const handleLogout = async () => {
  if (gateOk.value) {
    // revoke the per-tab gate session (also drops the HttpOnly cookie)
    try {
      await api.fetch('/admin/gate_sessions/revoke', {
        method: 'POST',
        body: JSON.stringify({ current: true })
      });
    } catch (_) { /* best-effort revocation */ }
  }
  if (adminJwt.value) {
    try {
      await api.fetch('/open_api/admin_logout', { method: 'POST' });
    } catch (_) { /* best-effort revocation */ }
  }
  clearGateSession();
  adminAuth.value = '';
  adminJwt.value = '';
  showAdminAuth.value = false;
  adminTab.value = 'account';
  message.success(t('logoutSuccess'));
  await router.push(getRouterPathWithLang('/', locale.value));
}

const { t, locale } = useScopedI18n('views.Admin')

const showAdminPasswordModal = computed(() => !showAdminPage.value || showAdminAuth.value)
const tmpAdminAuth = ref('')
// 判断是否通过 admin password 登录（而非用户管理员权限）
const isAdminPasswordLogin = computed(() => !!adminAuth.value)

// 获取当前登录方式
const currentLoginMethod = computed(() => {
  if (adminAuth.value) {
    return t('loginViaPassword');
  } else if (userSettings.value.is_admin) {
    return t('loginViaUserAdmin');
  } else if (openSettings.value.disableAdminPasswordCheck) {
    return t('loginViaDisabledCheck');
  }
  return '';
})

// P0-B4 rework: live admin gate sessions — tokens are minted only by the
// homepage entry, the panel can watch and revoke them
const gateSessions = ref([])
const loadGateSessions = async () => {
  try {
    const res = await api.fetch('/admin/gate_sessions');
    gateSessions.value = res?.sessions || [];
  } catch (error) {
    if (error?.status === 404) handleGateDeath();
  }
}
const revokeGateSession = async (tokenHash) => {
  try {
    await api.fetch('/admin/gate_sessions/revoke', {
      method: 'POST',
      body: JSON.stringify({ token_hash: tokenHash })
    });
    await loadGateSessions();
  } catch (error) {
    if (error?.status === 404) return handleGateDeath();
    message.error(error.message || "error");
  }
}
const revokeOtherGateSessions = async () => {
  try {
    await api.fetch('/admin/gate_sessions/revoke', {
      method: 'POST',
      body: JSON.stringify({ all_except_current: true })
    });
    await loadGateSessions();
    message.success('已吊销其它会话');
  } catch (error) {
    if (error?.status === 404) return handleGateDeath();
    message.error(error.message || "error");
  }
}
const formatGateTime = (seconds) => seconds ? new Date(seconds * 1000).toLocaleString() : '-';
const gateLastSeen = (seconds) => {
  if (!seconds) return '从未心跳';
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  return formatGateTime(seconds);
}

onMounted(async () => {
  if (!gateOk.value) return;
  // heartbeat starts immediately and survives the password prompt
  pingGate();
  gateHeartbeatTimer = setInterval(pingGate, 30000);
  document.addEventListener('visibilitychange', onVisibilityChange);
  // make sure openSettings is fetched for turnstile check
  if (!openSettings.value.fetched) await api.getOpenSettings(message);
  // make sure user_id is fetched
  if (!userSettings.value.user_id) await api.getUserSettings(message);
  if (showAdminPage.value) await loadGateSessions();
})

onUnmounted(() => {
  if (gateHeartbeatTimer) clearInterval(gateHeartbeatTimer);
  document.removeEventListener('visibilitychange', onVisibilityChange);
})
</script>

<template>
  <!-- P0-B4 rework: no per-tab session (URL copied, window closed, expired)
       → same branded 404 the server serves for ungated requests -->
  <div v-if="!gateOk" class="gate-404-page">
    <div class="gate-404-box">
      <div class="gate-404-code">404</div>
      <div class="gate-404-tip">页面不存在或已被移除</div>
      <a href="/">返回首页</a>
    </div>
  </div>
  <div v-else-if="openSettings.fetched && userSettings.fetched">
    <n-modal v-model:show="showAdminPasswordModal" :closable="false" :closeOnEsc="false" :maskClosable="false"
      preset="dialog" :title="t('accessHeader')">
      <p>{{ t('accessTip') }}</p>
      <n-input v-model:value="tmpAdminAuth" type="password" show-password-on="click" @keyup.enter="authFunc" />
      <Turnstile ref="turnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="cfToken" />
      <template #action>
        <n-button @click="authFunc" type="primary" :loading="loading">
          {{ t('ok') }}
        </n-button>
      </template>
    </n-modal>
    <n-tabs v-if="showAdminPage" type="card" v-model:value="adminTab" :placement="globalTabplacement">
      <template #suffix>
        <n-button size="small" type="warning" secondary class="admin-logout-button" @click="showLogoutModal = true">
          {{ t('logout') }}
        </n-button>
      </template>
      <n-tab-pane name="qucickSetup" :tab="t('qucickSetup')">
        <n-tabs key="quick-setup-tabs" type="bar" justify-content="center" animated>
          <n-tab-pane name="database" :tab="t('database')">
            <DatabaseManager />
          </n-tab-pane>
          <n-tab-pane name="site_settings" tab="站点设置">
            <SiteSettings />
          </n-tab-pane>
          <n-tab-pane name="account_settings" :tab="t('mailbox_settings')">
            <AccountSettings />
          </n-tab-pane>
          <n-tab-pane name="user_settings" :tab="t('user_settings')">
            <UserSettings />
          </n-tab-pane>
          <n-tab-pane name="workerconfig" :tab="t('workerconfig')">
            <WorkerConfig />
          </n-tab-pane>
          <n-tab-pane name="security" :tab="t('securitySettings')">
            <SecuritySettings />
          </n-tab-pane>
        </n-tabs>
      </n-tab-pane>
      <n-tab-pane name="account" :tab="t('mailbox_management')">
        <n-tabs key="account-tabs" type="bar" justify-content="center" animated>
          <n-tab-pane name="account" :tab="t('mailbox_list')">
            <Account />
          </n-tab-pane>
          <n-tab-pane name="account_create" :tab="t('mailbox_create')">
            <CreateAccount />
          </n-tab-pane>
          <n-tab-pane name="account_settings" :tab="t('mailbox_settings')">
            <AccountSettings />
          </n-tab-pane>
          <n-tab-pane name="senderAccess" :tab="t('senderAccess')">
            <SenderAccess />
          </n-tab-pane>
          <n-tab-pane name="ipBlacklistSettings" :tab="t('ipBlacklistSettings')">
            <IpBlacklistSettings />
          </n-tab-pane>
          <n-tab-pane name="aiExtractSettings" :tab="t('aiExtractSettings')">
            <AiExtractSettings />
          </n-tab-pane>
          <n-tab-pane name="webhook" :tab="t('webhookSettings')">
            <Webhook />
          </n-tab-pane>
        </n-tabs>
      </n-tab-pane>
      <n-tab-pane name="user" :tab="t('user')">
        <n-tabs key="user-tabs" type="bar" justify-content="center" animated>
          <n-tab-pane name="user_management" :tab="t('user_management')">
            <UserManagement />
          </n-tab-pane>
          <n-tab-pane name="user_settings" :tab="t('user_settings')">
            <UserSettings />
          </n-tab-pane>
          <n-tab-pane name="userOauth2Settings" :tab="t('userOauth2Settings')">
            <UserOauth2Settings />
          </n-tab-pane>
          <n-tab-pane name="roleAddressConfig" :tab="t('roleAddressConfig')">
            <RoleAddressConfig />
          </n-tab-pane>
        </n-tabs>
      </n-tab-pane>
      <n-tab-pane name="mails" :tab="t('mails')">
        <n-tabs key="mails-tabs" type="bar" justify-content="center" animated>
          <n-tab-pane name="mails" :tab="t('mails')">
            <Mails />
          </n-tab-pane>
          <n-tab-pane name="unknow" :tab="t('unknow')">
            <MailsUnknow />
          </n-tab-pane>
          <n-tab-pane name="sendBox" :tab="t('sendBox')">
            <SendBox />
          </n-tab-pane>
          <n-tab-pane name="sendMail" :tab="t('sendMail')">
            <SendMail />
          </n-tab-pane>
          <n-tab-pane name="mailWebhook" :tab="t('mailWebhook')">
            <MailWebhook />
          </n-tab-pane>
        </n-tabs>
      </n-tab-pane>
      <n-tab-pane name="telegram" :tab="t('telegram')">
        <Telegram />
      </n-tab-pane>
      <n-tab-pane name="statistics" :tab="t('statistics')">
        <Statistics />
      </n-tab-pane>
      <n-tab-pane v-if="openSettings.enableRedeemCode" name="redeemCodes" :tab="t('redeemCodes')">
        <RedeemCodes />
      </n-tab-pane>
      <n-tab-pane name="maintenance" :tab="t('maintenance')">
        <n-tabs key="maintenance-tabs" type="bar" justify-content="center" animated>
          <n-tab-pane name="database" :tab="t('database')">
            <DatabaseManager />
          </n-tab-pane>
          <n-tab-pane name="workerconfig" :tab="t('workerconfig')">
            <WorkerConfig />
          </n-tab-pane>
          <n-tab-pane name="maintenance" :tab="t('maintenance')">
            <Maintenance />
          </n-tab-pane>
        </n-tabs>
      </n-tab-pane>
      <n-tab-pane name="appearance" :tab="t('appearance')">
        <Appearance />
      </n-tab-pane>
      <n-tab-pane name="adminAccount" :tab="t('adminAccount')">
        <div style="display: flex; justify-content: center; padding: 20px;">
          <n-card style="width: 600px;">
            <n-space vertical>
              <n-text strong>{{ t('loginMethod') }}</n-text>
              <n-text>{{ currentLoginMethod }}</n-text>
              <n-divider v-if="isAdminPasswordLogin" />
              <n-button v-if="isAdminPasswordLogin" type="warning" @click="showLogoutModal = true" block>
                {{ t('logout') }}
              </n-button>
            </n-space>
          </n-card>
        </div>
        <div style="display: flex; justify-content: center; padding: 0 20px 20px;">
          <n-card style="width: 640px;">
            <n-space vertical>
              <n-text strong>后台会话管理</n-text>
              <n-text depth="3">
                直接输入后台地址会返回 404。只有在首页点击后台入口（logo 旁的小圆点），
                才会生成一个 60 秒有效的一次性令牌（64 位）打开后台；令牌兑换出的会话
                保存在该标签页的 sessionStorage 中，关闭窗口后心跳停止，约 2 分钟后
                服务端自动失效。令牌只能从首页生成，这里只能查看和吊销。
              </n-text>
              <n-space align="center" justify="space-between">
                <n-button size="small" :loading="loading" @click="loadGateSessions">
                  刷新
                </n-button>
                <n-button size="small" type="error" secondary @click="revokeOtherGateSessions"
                  :disabled="!gateSessions.some(s => s.active && !s.current)">
                  吊销其它所有会话
                </n-button>
              </n-space>
              <n-divider style="margin: 8px 0;" />
              <n-text strong>活跃会话</n-text>
              <n-empty v-if="!gateSessions.length" size="small" description="暂无会话记录" />
              <n-table v-else size="small" :bordered="false">
                <thead>
                  <tr>
                    <th>会话</th>
                    <th>创建时间</th>
                    <th>最后心跳</th>
                    <th>状态</th>
                    <th style="width: 80px;">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="session in gateSessions" :key="session.token_hash">
                    <td>
                      <n-text code>{{ session.prefix }}</n-text>
                      <n-tag v-if="session.current" type="success" size="tiny"
                        style="margin-left: 6px;">当前</n-tag>
                    </td>
                    <td>{{ formatGateTime(session.created_at) }}</td>
                    <td>{{ gateLastSeen(session.last_seen) }}</td>
                    <td>
                      <n-tag v-if="session.revoked_at" type="error" size="tiny">已吊销</n-tag>
                      <n-tag v-else-if="!session.active" size="tiny">已过期</n-tag>
                      <n-tag v-else type="success" size="tiny">活跃</n-tag>
                    </td>
                    <td>
                      <n-button v-if="!session.revoked_at" size="tiny" tertiary type="error"
                        @click="revokeGateSession(session.token_hash)">
                        吊销
                      </n-button>
                    </td>
                  </tr>
                </tbody>
              </n-table>
            </n-space>
          </n-card>
        </div>
      </n-tab-pane>
      <n-tab-pane name="about" :tab="t('about')">
        <About />
      </n-tab-pane>
    </n-tabs>
    <n-modal v-model:show="showLogoutModal" preset="dialog" :title="t('logoutConfirmTitle')">
      <p>{{ t('logoutConfirmContent') }}</p>
      <template #action>
        <n-button :loading="loading" @click="handleLogout" size="small" tertiary type="warning">
          {{ t('confirm') }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.n-pagination {
  margin-top: 10px;
  margin-bottom: 10px;
}

.admin-logout-button {
  margin-left: 12px;
  align-self: center;
}

/* branded 404 — kept byte-identical with the server-rendered page */
.gate-404-page {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

.gate-404-box {
  text-align: center;
  padding: 40px;
}

.gate-404-code {
  font-size: 96px;
  font-weight: 800;
  letter-spacing: 8px;
  line-height: 1;
  background: linear-gradient(180deg, #7d8590, #30363d);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.gate-404-tip {
  margin-top: 14px;
  opacity: 0.65;
  font-size: 14px;
}

.gate-404-box a {
  display: inline-block;
  margin-top: 22px;
  padding: 8px 18px;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 6px;
  color: inherit;
  text-decoration: none;
  font-size: 14px;
}
</style>
