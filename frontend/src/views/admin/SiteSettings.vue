<script setup>
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { api } from '../../api'
import { LOCALE_REGISTRY } from '../../i18n/locale-registry'
import { useScopedI18n } from '@/i18n/app'

const { t } = useScopedI18n('views.admin.SiteSettings')

const STORAGE_KEY = 'site-settings'
const ANNOUNCEMENTS_KEY = 'announcements'

const message = useMessage()
const saving = ref(false)
const loading = ref(false)

const localeOptions = [
    { label: t('followBrowser'), value: '' },
    ...LOCALE_REGISTRY.map(({ locale, label }) => ({ label, value: locale })),
]

// 问题18-①: day-boundary timezone for public stats, default Beijing time
const timezoneOptions = [
    { label: t('tzBeijing'), value: '+08:00' },
    { label: t('tzTokyo'), value: '+09:00' },
    { label: t('tzBangkok'), value: '+07:00' },
    { label: t('tzDhaka'), value: '+06:00' },
    { label: t('tzDelhi'), value: '+05:30' },
    { label: t('tzDubai'), value: '+04:00' },
    { label: t('tzMoscow'), value: '+03:00' },
    { label: t('tzCairo'), value: '+02:00' },
    { label: t('tzBerlin'), value: '+01:00' },
    { label: t('tzLondon'), value: '+00:00' },
    { label: t('tzNewYork'), value: '-05:00' },
    { label: t('tzLosAngeles'), value: '-08:00' },
    { label: t('tzSaoPaulo'), value: '-03:00' },
]

const form = ref({
    title: '',
    copyright: '',
    intro: '',
    guide: '',
    // 问题5: site-wide address prefix, empty = fall back to env PREFIX
    prefix: '',
    defaultLocale: '',
    statsMode: 'real',
    statsTimezone: '+08:00',
    statsToday: 0,
    statsWeek: 0,
    statsMonth: 0,
    statsYear: 0,
    statsSendToday: 0,
    statsSendWeek: 0,
    statsSendMonth: 0,
    statsSendYear: 0,
})

const announcements = ref([])
const newAnnouncement = ref('')
const editingIndex = ref(-1)
const editingContent = ref('')

const load = async () => {
    loading.value = true
    try {
        // local n-spin is the feedback — skip the app-wide overlay
        const res = await api.fetch(`/admin/config/${STORAGE_KEY}`, { showLoading: false })
        if (res?.value) {
            const parsed = JSON.parse(res.value)
            Object.assign(form.value, {
                title: parsed.title || '',
                copyright: parsed.copyright || '',
                intro: parsed.intro || '',
                guide: parsed.guide || '',
                prefix: parsed.prefix || '',
                defaultLocale: parsed.defaultLocale || '',
                statsMode: parsed.statsMode === 'manual' ? 'manual' : 'real',
                statsTimezone: parsed.statsTimezone || '+08:00',
                statsToday: parsed.statsManual?.today ?? 0,
                statsWeek: parsed.statsManual?.week ?? 0,
                statsMonth: parsed.statsManual?.month ?? 0,
                statsYear: parsed.statsManual?.year ?? 0,
                statsSendToday: parsed.statsManual?.sendToday ?? 0,
                statsSendWeek: parsed.statsManual?.sendWeek ?? 0,
                statsSendMonth: parsed.statsManual?.sendMonth ?? 0,
                statsSendYear: parsed.statsManual?.sendYear ?? 0,
            })
        }
    } catch (error) {
        // first time there may be no saved value yet
        console.warn('load site settings failed', error)
    }
    try {
        const res = await api.fetch(`/admin/config/${ANNOUNCEMENTS_KEY}`, { showLoading: false })
        if (res?.value) {
            const parsed = JSON.parse(res.value)
            if (Array.isArray(parsed)) announcements.value = parsed
        }
    } catch (error) {
        console.warn('load announcements failed', error)
    } finally {
        loading.value = false
    }
}

const saveSettings = async () => {
    saving.value = true
    try {
        await api.fetch('/admin/config', {
            method: 'POST',
            // button :loading="saving" is the feedback — no app-wide overlay
            showLoading: false,
            body: {
                key: STORAGE_KEY,
                value: JSON.stringify({
                    title: form.value.title.trim(),
                    copyright: form.value.copyright.trim(),
                    intro: form.value.intro.trim(),
                    guide: form.value.guide.trim(),
                    prefix: form.value.prefix.trim(),
                    defaultLocale: form.value.defaultLocale,
                    statsMode: form.value.statsMode,
                    statsTimezone: form.value.statsTimezone,
                    statsManual: {
                        today: Number(form.value.statsToday) || 0,
                        week: Number(form.value.statsWeek) || 0,
                        month: Number(form.value.statsMonth) || 0,
                        year: Number(form.value.statsYear) || 0,
                        sendToday: Number(form.value.statsSendToday) || 0,
                        sendWeek: Number(form.value.statsSendWeek) || 0,
                        sendMonth: Number(form.value.statsSendMonth) || 0,
                        sendYear: Number(form.value.statsSendYear) || 0,
                    },
                }),
            },
        })
        message.success(t('saveSuccess'))
    } catch (error) {
        message.error(error.message || t('saveFailed'))
    } finally {
        saving.value = false
    }
}

const persistAnnouncements = async () => {
    await api.fetch('/admin/config', {
        method: 'POST',
        body: {
            key: ANNOUNCEMENTS_KEY,
            value: JSON.stringify(announcements.value),
        },
    })
}

const addAnnouncement = async () => {
    const content = newAnnouncement.value.trim()
    if (!content) {
        message.warning(t('announcementEmpty'))
        return
    }
    announcements.value.push({
        id: `${Date.now()}`,
        content,
        enabled: true,
    })
    newAnnouncement.value = ''
    try {
        await persistAnnouncements()
        message.success(t('announcementPublished'))
    } catch (error) {
        message.error(error.message || t('saveFailed'))
    }
}

const toggleAnnouncement = async (index) => {
    const item = announcements.value[index]
    if (!item) return
    item.enabled = !item.enabled
    try {
        await persistAnnouncements()
        message.success(item.enabled ? t('announcementPublished') : t('announcementOffline'))
    } catch (error) {
        message.error(error.message || t('saveFailed'))
    }
}

const startEditAnnouncement = (index) => {
    editingIndex.value = index
    editingContent.value = announcements.value[index]?.content || ''
}

const confirmEditAnnouncement = async () => {
    const content = editingContent.value.trim()
    if (!content) {
        message.warning(t('announcementEmpty'))
        return
    }
    const item = announcements.value[editingIndex.value]
    if (item) item.content = content
    editingIndex.value = -1
    editingContent.value = ''
    try {
        await persistAnnouncements()
        message.success(t('announcementUpdated'))
    } catch (error) {
        message.error(error.message || t('saveFailed'))
    }
}

const removeAnnouncement = async (index) => {
    announcements.value.splice(index, 1)
    if (editingIndex.value === index) editingIndex.value = -1
    try {
        await persistAnnouncements()
        message.success(t('announcementDeleted'))
    } catch (error) {
        message.error(error.message || t('saveFailed'))
    }
}

onMounted(load)
</script>

<template>
    <div class="site-settings">
        <div class="page-head">
            <h2>{{ t('pageTitle') }}</h2>
            <p>{{ t('pageDesc') }}</p>
        </div>

        <n-card :bordered="false" embedded :title="t('basicInfoCard')" style="margin-bottom: 12px;">
            <n-spin :show="loading">
                <n-form label-placement="left" label-width="96px" style="max-width: 760px">
                    <n-form-item :label="t('siteTitleLabel')">
                        <n-input v-model:value="form.title" :placeholder="t('siteTitlePlaceholder')" />
                    </n-form-item>
                    <n-form-item :label="t('copyrightLabel')">
                        <n-input v-model:value="form.copyright"
                            :placeholder="t('copyrightPlaceholder')" />
                    </n-form-item>
                    <n-form-item :label="t('introLabel')">
                        <n-input v-model:value="form.intro" type="textarea" :rows="3"
                            :placeholder="t('introPlaceholder')" />
                    </n-form-item>
                    <n-form-item :label="t('defaultLocaleLabel')">
                        <n-select v-model:value="form.defaultLocale" :options="localeOptions" />
                        <template #feedback>
                            <span class="form-hint">
                                {{ t('defaultLocaleHint') }}
                            </span>
                        </template>
                    </n-form-item>
                    <n-form-item :label="t('prefixLabel')">
                        <n-input v-model:value="form.prefix" clearable
                            :placeholder="t('prefixPlaceholder')" />
                        <template #feedback>
                            <span class="form-hint">
                                {{ t('prefixHint') }}
                            </span>
                        </template>
                    </n-form-item>
                </n-form>
            </n-spin>
        </n-card>

        <n-card :bordered="false" embedded :title="t('statsCard')" style="margin-bottom: 12px;">
            <n-form label-placement="left" label-width="96px" style="max-width: 760px">
                <n-form-item :label="t('statsModeLabel')">
                    <n-radio-group v-model:value="form.statsMode">
                        <n-space>
                            <n-radio value="real">{{ t('statsModeReal') }}</n-radio>
                            <n-radio value="manual">{{ t('statsModeManual') }}</n-radio>
                        </n-space>
                    </n-radio-group>
                </n-form-item>
                <n-form-item :label="t('timezoneLabel')">
                    <n-select v-model:value="form.statsTimezone" :options="timezoneOptions" filterable tag />
                    <template #feedback>
                        <span class="form-hint">
                            {{ t('timezoneHint') }}
                        </span>
                    </template>
                </n-form-item>
                <template v-if="form.statsMode === 'manual'">
                    <n-form-item :label="t('receiveStatsLabel')">
                        <n-input-group style="width: 100%">
                            <n-input-group-label>{{ t('periodToday') }}</n-input-group-label>
                            <n-input v-model:value="form.statsToday" />
                            <n-input-group-label>{{ t('periodWeek') }}</n-input-group-label>
                            <n-input v-model:value="form.statsWeek" />
                            <n-input-group-label>{{ t('periodMonth') }}</n-input-group-label>
                            <n-input v-model:value="form.statsMonth" />
                            <n-input-group-label>{{ t('periodYear') }}</n-input-group-label>
                            <n-input v-model:value="form.statsYear" />
                        </n-input-group>
                    </n-form-item>
                    <n-form-item :label="t('sendStatsLabel')">
                        <n-input-group style="width: 100%">
                            <n-input-group-label>{{ t('periodToday') }}</n-input-group-label>
                            <n-input v-model:value="form.statsSendToday" />
                            <n-input-group-label>{{ t('periodWeek') }}</n-input-group-label>
                            <n-input v-model:value="form.statsSendWeek" />
                            <n-input-group-label>{{ t('periodMonth') }}</n-input-group-label>
                            <n-input v-model:value="form.statsSendMonth" />
                            <n-input-group-label>{{ t('periodThisYear') }}</n-input-group-label>
                            <n-input v-model:value="form.statsSendYear" />
                        </n-input-group>
                        <template #feedback>
                            <span class="form-hint">{{ t('sendStatsHint') }}</span>
                        </template>
                    </n-form-item>
                </template>
                <n-form-item label=" ">
                    <n-space>
                        <n-button type="primary" :loading="saving" @click="saveSettings">{{ t('saveBtn') }}</n-button>
                        <n-button secondary @click="load">{{ t('reloadBtn') }}</n-button>
                    </n-space>
                </n-form-item>
            </n-form>
            <n-alert type="info" :bordered="false" style="margin-top: 8px">
                {{ t('statsAlert') }}
            </n-alert>
        </n-card>

        <n-card :bordered="false" embedded :title="t('announcementCard')">
            <div class="announcement-form">
                <n-input v-model:value="newAnnouncement" type="textarea" :rows="2"
                    :placeholder="t('announcementPlaceholder')" @keyup.ctrl.enter="addAnnouncement" />
                <n-button type="primary" size="small" style="margin-top: 8px;" @click="addAnnouncement">
                    {{ t('publishAnnouncementBtn') }}
                </n-button>
            </div>

            <n-empty v-if="!announcements.length" :description="t('noAnnouncements')" style="margin-top: 16px;" />

            <n-list v-else :show-divider="false" style="margin-top: 12px;">
                <n-list-item v-for="(item, index) in announcements" :key="item.id || index">
                    <div class="announcement-row">
                        <template v-if="editingIndex === index">
                            <n-input v-model:value="editingContent" type="textarea" :rows="2" />
                            <n-space size="small" style="margin-top: 6px;">
                                <n-button type="primary" size="tiny" @click="confirmEditAnnouncement">{{ t('saveBtn') }}</n-button>
                                <n-button size="tiny" secondary @click="editingIndex = -1">{{ t('cancelBtn') }}</n-button>
                            </n-space>
                        </template>
                        <template v-else>
                            <div class="announcement-content" :class="{ 'is-offline': !item.enabled }">
                                {{ item.content }}
                            </div>
                            <div class="announcement-actions">
                                <n-tag :bordered="false" size="small">
                                    {{ item.enabled ? t('statusPublished') : t('statusOffline') }}
                                </n-tag>
                                <n-button size="tiny" secondary @click="startEditAnnouncement(index)">{{ t('editBtn') }}</n-button>
                                <n-button size="tiny" secondary
                                    @click="toggleAnnouncement(index)">
                                    {{ item.enabled ? t('offlineShort') : t('publishShort') }}
                                </n-button>
                                <n-popconfirm @positive-click="removeAnnouncement(index)">
                                    <template #trigger>
                                        <n-button size="tiny" type="error" secondary>{{ t('deleteBtn') }}</n-button>
                                    </template>
                                    {{ t('deleteAnnouncementConfirm') }}
                                </n-popconfirm>
                            </div>
                        </template>
                    </div>
                </n-list-item>
            </n-list>

            <n-alert type="info" :bordered="false" style="margin-top: 12px">
                {{ t('announcementListAlert') }}
            </n-alert>
        </n-card>
    </div>
</template>

<style scoped>
.site-settings .page-head {
    margin-bottom: 12px;
}

.site-settings .page-head h2 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 4px;
}

.site-settings .page-head p {
    font-size: 12.5px;
    opacity: 0.6;
    line-height: 1.6;
}

.form-hint {
    font-size: 12px;
    opacity: 0.7;
}

.announcement-form {
    max-width: 760px;
}

.announcement-row {
    width: 100%;
}

.announcement-content {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.7;
    font-size: 14px;
}

.announcement-content.is-offline {
    opacity: 0.5;
    text-decoration: line-through;
}

.announcement-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
}
</style>
