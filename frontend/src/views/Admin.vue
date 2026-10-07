<script setup>
import { computed, onMounted, ref } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'

import { useGlobalState } from '../store'
import { api } from '../api'
import { getRouterPathWithLang, hashPassword, getAdminPath } from '../utils'
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
  if (adminJwt.value) {
    try {
      await api.fetch('/open_api/admin_logout', { method: 'POST' });
    } catch (_) { /* best-effort revocation */ }
  }
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

// P0-B4: one-time admin gate tokens (?k=)
const gateTtlHours = ref(24)
const gateTokens = ref([])
const newGateUrl = ref('')
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    message.success('已复制');
  } catch (_) {
    message.warning('复制失败，请手动选择复制');
  }
}
const loadGateTokens = async () => {
  try {
    const res = await api.fetch('/admin/gate_tokens');
    gateTokens.value = res?.tokens || [];
    return res;
  } catch (error) {
    return null;
  }
}
const createGateToken = async () => {
  try {
    const res = await api.fetch('/admin/gate_tokens', {
      method: 'POST',
      body: JSON.stringify({ ttl_hours: gateTtlHours.value })
    });
    newGateUrl.value = res?.url || '';
    await loadGateTokens();
  } catch (error) {
    message.error(error.message || "error");
  }
}
const gateTokenUrl = (token) => `${location.origin}${getAdminPath()}?k=${token}`;
const revokeGateToken = async (token) => {
  try {
    await api.fetch('/admin/gate_tokens/revoke', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    await loadGateTokens();
  } catch (error) {
    message.error(error.message || "error");
  }
}

onMounted(async () => {
  // make sure openSettings is fetched for turnstile check
  if (!openSettings.value.fetched) await api.getOpenSettings(message);
  // make sure user_id is fetched
  if (!userSettings.value.user_id) await api.getUserSettings(message);
  if (showAdminPage.value) await loadGateTokens();
})
</script>

<template>
  <div v-if="openSettings.fetched && userSettings.fetched">
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
          <n-card style="width: 600px;">
            <n-space vertical>
              <n-text strong>后台访问令牌（?k= 一次性）</n-text>
              <n-text depth="3">
                直接输入后台地址会返回 404。用带 ?k= 的链接换取 7 天访问 Cookie 后才能打开后台；
                一次性令牌只能用一次，静态引导秘钥（ADMIN_GATE_TOKEN）可重复使用。
              </n-text>
              <n-space align="center">
                <n-input-number v-model:value="gateTtlHours" :min="1" :max="720" size="small" style="width: 150px;">
                  <template #suffix>小时</template>
                </n-input-number>
                <n-button type="primary" size="small" :loading="loading" @click="createGateToken">
                  生成一次性令牌
                </n-button>
              </n-space>
              <n-alert v-if="newGateUrl" type="success" title="新链接（仅此一次展示）" closable
                @close="newGateUrl = ''">
                <n-space vertical size="small">
                  <n-text code style="word-break: break-all; user-select: all;">{{ newGateUrl }}</n-text>
                  <n-button size="tiny" tertiary @click="copyText(newGateUrl)">复制链接</n-button>
                </n-space>
              </n-alert>
              <n-divider style="margin: 8px 0;" />
              <n-text strong>未使用的令牌</n-text>
              <n-empty v-if="!gateTokens.length" size="small" description="暂无未使用令牌" />
              <n-table v-else size="small" :bordered="false">
                <thead>
                  <tr>
                    <th>令牌</th>
                    <th>过期时间</th>
                    <th style="width: 110px;">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="tk in gateTokens" :key="tk.token">
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                      :title="tk.token">{{ tk.token }}</td>
                    <td>{{ new Date(tk.expires_at * 1000).toLocaleString() }}</td>
                    <td>
                      <n-space size="small">
                        <n-button size="tiny" tertiary @click="copyText(gateTokenUrl(tk.token))">复制</n-button>
                        <n-button size="tiny" tertiary type="error" @click="revokeGateToken(tk.token)">
                          删除
                        </n-button>
                      </n-space>
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
</style>
