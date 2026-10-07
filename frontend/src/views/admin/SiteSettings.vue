<script setup>
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { api } from '../../api'
import { LOCALE_REGISTRY } from '../../i18n/locale-registry'

const STORAGE_KEY = 'site-settings'
const ANNOUNCEMENTS_KEY = 'announcements'

const message = useMessage()
const saving = ref(false)
const loading = ref(false)

const localeOptions = [
    { label: '跟随浏览器（推荐）', value: '' },
    ...LOCALE_REGISTRY.map(({ locale, label }) => ({ label, value: locale })),
]

const form = ref({
    title: '',
    copyright: '',
    intro: '',
    guide: '',
    defaultLocale: '',
    statsMode: 'real',
    statsToday: 0,
    statsWeek: 0,
    statsMonth: 0,
})

const announcements = ref([])
const newAnnouncement = ref('')
const editingIndex = ref(-1)
const editingContent = ref('')

const load = async () => {
    loading.value = true
    try {
        const res = await api.fetch(`/admin/config/${STORAGE_KEY}`)
        if (res?.value) {
            const parsed = JSON.parse(res.value)
            Object.assign(form.value, {
                title: parsed.title || '',
                copyright: parsed.copyright || '',
                intro: parsed.intro || '',
                guide: parsed.guide || '',
                defaultLocale: parsed.defaultLocale || '',
                statsMode: parsed.statsMode === 'manual' ? 'manual' : 'real',
                statsToday: parsed.statsManual?.today ?? 0,
                statsWeek: parsed.statsManual?.week ?? 0,
                statsMonth: parsed.statsManual?.month ?? 0,
            })
        }
    } catch (error) {
        // first time there may be no saved value yet
        console.warn('load site settings failed', error)
    }
    try {
        const res = await api.fetch(`/admin/config/${ANNOUNCEMENTS_KEY}`)
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
            body: {
                key: STORAGE_KEY,
                value: JSON.stringify({
                    title: form.value.title.trim(),
                    copyright: form.value.copyright.trim(),
                    intro: form.value.intro.trim(),
                    guide: form.value.guide.trim(),
                    defaultLocale: form.value.defaultLocale,
                    statsMode: form.value.statsMode,
                    statsManual: {
                        today: Number(form.value.statsToday) || 0,
                        week: Number(form.value.statsWeek) || 0,
                        month: Number(form.value.statsMonth) || 0,
                    },
                }),
            },
        })
        message.success('保存成功，刷新页面后生效')
    } catch (error) {
        message.error(error.message || '保存失败')
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
        message.warning('公告内容不能为空')
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
        message.success('公告已发布')
    } catch (error) {
        message.error(error.message || '保存失败')
    }
}

const toggleAnnouncement = async (index) => {
    const item = announcements.value[index]
    if (!item) return
    item.enabled = !item.enabled
    try {
        await persistAnnouncements()
        message.success(item.enabled ? '公告已发布' : '公告已下线')
    } catch (error) {
        message.error(error.message || '保存失败')
    }
}

const startEditAnnouncement = (index) => {
    editingIndex.value = index
    editingContent.value = announcements.value[index]?.content || ''
}

const confirmEditAnnouncement = async () => {
    const content = editingContent.value.trim()
    if (!content) {
        message.warning('公告内容不能为空')
        return
    }
    const item = announcements.value[editingIndex.value]
    if (item) item.content = content
    editingIndex.value = -1
    editingContent.value = ''
    try {
        await persistAnnouncements()
        message.success('公告已更新')
    } catch (error) {
        message.error(error.message || '保存失败')
    }
}

const removeAnnouncement = async (index) => {
    announcements.value.splice(index, 1)
    if (editingIndex.value === index) editingIndex.value = -1
    try {
        await persistAnnouncements()
        message.success('公告已删除')
    } catch (error) {
        message.error(error.message || '保存失败')
    }
}

onMounted(load)
</script>

<template>
    <div>
        <n-card :bordered="false" embedded title="站点设置" style="margin-bottom: 12px;">
            <n-spin :show="loading">
                <n-form label-placement="left" label-width="96px" style="max-width: 760px">
                    <n-form-item label="站点标题">
                        <n-input v-model:value="form.title" placeholder="留空则使用 wrangler.toml 中的 TITLE" />
                    </n-form-item>
                    <n-form-item label="底部版权信息">
                        <n-input v-model:value="form.copyright"
                            placeholder="留空则使用 wrangler.toml 中的 COPYRIGHT，显示于首页底部" />
                    </n-form-item>
                    <n-form-item label="首页简介">
                        <n-input v-model:value="form.intro" type="textarea" :rows="3"
                            placeholder="留空则使用默认简介（显示于首页介绍卡片）" />
                    </n-form-item>
                    <n-form-item label="默认语言">
                        <n-select v-model:value="form.defaultLocale" :options="localeOptions" />
                        <template #feedback>
                            <span style="font-size: 12px; opacity: 0.7;">
                                未手动选择过语言的访客将看到此语言；用户自己选择过的语言优先。
                            </span>
                        </template>
                    </n-form-item>
                    <n-form-item label="统计方式">
                        <n-radio-group v-model:value="form.statsMode">
                            <n-space>
                                <n-radio value="real">读取真实数据</n-radio>
                                <n-radio value="manual">手动填写数字</n-radio>
                            </n-space>
                        </n-radio-group>
                    </n-form-item>
                    <n-form-item v-if="form.statsMode === 'manual'" label="统计数字">
                        <n-input-group style="width: 100%">
                            <n-input-group-label>今日</n-input-group-label>
                            <n-input v-model:value="form.statsToday" />
                            <n-input-group-label>本周</n-input-group-label>
                            <n-input v-model:value="form.statsWeek" />
                            <n-input-group-label>本月</n-input-group-label>
                            <n-input v-model:value="form.statsMonth" />
                        </n-input-group>
                    </n-form-item>
                    <n-form-item label=" ">
                        <n-space>
                            <n-button type="primary" :loading="saving" @click="saveSettings">保存</n-button>
                            <n-button secondary @click="load">重新加载</n-button>
                        </n-space>
                    </n-form-item>
                </n-form>
            </n-spin>
            <n-alert type="info" :bordered="false" style="margin-top: 8px">
                保存后数据库中的值优先于 wrangler.toml 环境变量；留空则回退到环境变量。修改需刷新页面后生效。
            </n-alert>
        </n-card>

        <n-card :bordered="false" embedded title="公告管理">
            <div class="announcement-form">
                <n-input v-model:value="newAnnouncement" type="textarea" :rows="2"
                    placeholder="输入公告内容，支持换行；发布后显示在首页顶部标题右侧" @keyup.ctrl.enter="addAnnouncement" />
                <n-button type="primary" size="small" style="margin-top: 8px;" @click="addAnnouncement">
                    发布公告
                </n-button>
            </div>

            <n-empty v-if="!announcements.length" description="暂无公告" style="margin-top: 16px;" />

            <n-list v-else :show-divider="false" style="margin-top: 12px;">
                <n-list-item v-for="(item, index) in announcements" :key="item.id || index">
                    <div class="announcement-row">
                        <template v-if="editingIndex === index">
                            <n-input v-model:value="editingContent" type="textarea" :rows="2" />
                            <n-space size="small" style="margin-top: 6px;">
                                <n-button type="primary" size="tiny" @click="confirmEditAnnouncement">保存</n-button>
                                <n-button size="tiny" secondary @click="editingIndex = -1">取消</n-button>
                            </n-space>
                        </template>
                        <template v-else>
                            <div class="announcement-content" :class="{ 'is-offline': !item.enabled }">
                                {{ item.content }}
                            </div>
                            <div class="announcement-actions">
                                <n-tag :type="item.enabled ? 'success' : 'default'" size="small">
                                    {{ item.enabled ? '已发布' : '已下线' }}
                                </n-tag>
                                <n-button size="tiny" secondary @click="startEditAnnouncement(index)">编辑</n-button>
                                <n-button size="tiny" secondary :type="item.enabled ? 'warning' : 'success'"
                                    @click="toggleAnnouncement(index)">
                                    {{ item.enabled ? '下线' : '发布' }}
                                </n-button>
                                <n-popconfirm @positive-click="removeAnnouncement(index)">
                                    <template #trigger>
                                        <n-button size="tiny" type="error" secondary>删除</n-button>
                                    </template>
                                    确认删除这条公告？
                                </n-popconfirm>
                            </div>
                        </template>
                    </div>
                </n-list-item>
            </n-list>

            <n-alert type="info" :bordered="false" style="margin-top: 12px">
                启用中的公告会按顺序在首页顶部轮播显示，点击可查看全部。全部下线时回退到 wrangler.toml 的 ANNOUNCEMENT。
            </n-alert>
        </n-card>
    </div>
</template>

<style scoped>
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
