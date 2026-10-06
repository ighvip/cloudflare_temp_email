<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGlobalState } from '../../store'
import { api } from '../../api'

const { openSettings } = useGlobalState()

const DEFAULT_INTRO = 'TempMail 是基于 Cloudflare 构建的免费临时邮箱服务，无需注册即可快速生成临时邮件地址，用于接收注册验证码、验证邮件等，保护你的私人邮箱不被滥用。'

const DEFAULT_GUIDE = [
    '点击「创建邮箱」生成一个临时邮件地址',
    '将地址复制到需要注册 / 登录的网站填写',
    '回到本页收件箱，实时查看验证码与验证邮件',
    '（可选）在邮箱设置中为地址绑定密码，方便日后找回',
].map((text, index) => `${index + 1}. ${text}`).join('\n')

const introText = computed(() => (openSettings.value.siteIntro || '').trim() || DEFAULT_INTRO)
const guideText = computed(() => (openSettings.value.siteGuide || '').trim() || DEFAULT_GUIDE)

const status = ref(null)
const statusError = ref(false)
const checkedAt = ref('')
let timer = null

const fetchStatus = async (showLoading) => {
    try {
        const res = await api.fetch('/open_api/status', { showLoading: !!showLoading });
        status.value = res;
        statusError.value = !res || res.ok === false;
        checkedAt.value = res?.time ? new Date(res.time).toLocaleTimeString() : new Date().toLocaleTimeString();
    } catch (error) {
        status.value = null;
        statusError.value = true;
        checkedAt.value = new Date().toLocaleTimeString();
    }
}

const statusType = computed(() => {
    if (statusError.value) return 'error';
    if (!status.value) return 'default';
    return status.value.db ? 'success' : 'warning';
})

const statusText = computed(() => {
    if (statusError.value) return '服务异常';
    if (!status.value) return '检测中…';
    return status.value.db ? '服务正常' : '数据库不可用';
})

onMounted(() => {
    fetchStatus(false);
    timer = setInterval(() => fetchStatus(false), 30000);
})

onUnmounted(() => {
    if (timer) clearInterval(timer)
})
</script>

<template>
    <n-card class="home-info" :bordered="false" embedded>
        <div class="home-info-grid">
            <div class="home-info-section">
                <div class="home-info-title">站点简介</div>
                <p class="home-info-intro">{{ introText }}</p>
            </div>
            <div class="home-info-section">
                <div class="home-info-title">使用指南</div>
                <pre class="home-info-guide">{{ guideText }}</pre>
            </div>
            <div class="home-info-section home-info-status">
                <div class="home-info-title">服务器状态</div>
                <n-space align="center" :size="[8, 8]">
                    <n-tag :type="statusType" size="medium" round>
                        {{ statusText }}
                    </n-tag>
                    <n-button size="tiny" tertiary @click="fetchStatus(true)">刷新</n-button>
                </n-space>
                <div class="home-info-status-meta" v-if="status && !statusError">
                    <span>响应延迟 {{ status.latencyMs }}ms</span>
                    <span>· 数据库 {{ status.db ? '在线' : '离线' }}</span>
                    <span>· 版本 {{ status.version }}</span>
                </div>
                <div class="home-info-status-meta" v-else-if="statusError">
                    <span>无法获取状态</span>
                </div>
                <div class="home-info-status-meta" v-if="checkedAt">
                    <span>检测于 {{ checkedAt }}（每 30 秒自动刷新）</span>
                </div>
            </div>
        </div>
    </n-card>
</template>

<style scoped>
.home-info {
    margin-top: 10px;
}

.home-info-grid {
    display: grid;
    grid-template-columns: 1.4fr 1.2fr 1fr;
    gap: 20px;
}

@media (max-width: 768px) {
    .home-info-grid {
        grid-template-columns: 1fr;
    }
}

.home-info-title {
    font-weight: 600;
    margin-bottom: 8px;
}

.home-info-intro {
    margin: 0;
    line-height: 1.7;
    text-align: justify;
}

.home-info-guide {
    margin: 0;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.9;
    white-space: pre-wrap;
    word-break: break-word;
}

.home-info-status-meta {
    margin-top: 8px;
    font-size: 12px;
    opacity: 0.65;
    line-height: 1.8;
}

.home-info-status-meta span {
    margin-right: 6px;
}
</style>
