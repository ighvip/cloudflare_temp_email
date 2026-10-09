<script setup>
import { ref, onMounted } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { CleaningServicesFilled, AddFilled, DeleteFilled } from '@vicons/material'

import { useGlobalState } from '../../store'
import { api } from '../../api'

const { loading } = useGlobalState()
const message = useMessage()
const cleanupModel = ref({
    enableMailsAutoCleanup: false,
    cleanMailsDays: 30,
    enableUnknowMailsAutoCleanup: false,
    cleanUnknowMailsDays: 30,
    enableSendBoxAutoCleanup: false,
    cleanSendBoxDays: 30,
    enableAddressAutoCleanup: false,
    cleanAddressDays: 30,
    enableInactiveAddressAutoCleanup: false,
    cleanInactiveAddressDays: 30,
    enableUnboundAddressAutoCleanup: false,
    cleanUnboundAddressDays: 30,
    enableEmptyAddressAutoCleanup: false,
    cleanEmptyAddressDays: 30,
    customSqlCleanupList: []
})

const { t } = useScopedI18n('views.admin.Maintenance')

// ---- 问题12: 无效任务置灰显示（不删除、不隐藏、不标红）----
// 与 worker/src/admin_api/cleanup_api.ts 的 validateCustomSql 规则一致：
// 只允许单条 DELETE，不允许分号 / 注释，最长 1000 字符
const isValidSql = (sql) => {
    const value = (sql || '').trim()
    if (!value || value.length > 1000) return false
    if (!value.toUpperCase().startsWith('DELETE ')) return false
    if (value.includes(';')) return false
    if (/--|\/\*/.test(value)) return false
    return true
}

// cron 只执行「已启用且 SQL 合法」的任务，其余都算无效
const isInvalidTask = (item) => item?.enabled !== true || !isValidSql(item?.sql)

// 基础清理项：已勾选自动清理但天数不是合法的非负数字（如被清空为 null）
const isValidDays = (days) => typeof days === 'number' && Number.isFinite(days) && days >= 0
const basicInvalid = (enableKey, daysKey) => cleanupModel.value[enableKey] === true
    && !isValidDays(cleanupModel.value[daysKey])

const cleanup = async (cleanType, cleanDays) => {
    try {
        await api.fetch('/admin/cleanup', {
            method: 'POST',
            body: JSON.stringify({ cleanType, cleanDays })
        });
        message.success(t('cleanupSuccess'));
    } catch (error) {
        message.error(error.message || "error");
    }
}

const addCustomSql = () => {
    if (!cleanupModel.value.customSqlCleanupList) {
        cleanupModel.value.customSqlCleanupList = [];
    }
    cleanupModel.value.customSqlCleanupList.push({
        id: Date.now().toString(),
        name: '',
        sql: '',
        enabled: false
    });
}

const removeCustomSql = (index) => {
    cleanupModel.value.customSqlCleanupList.splice(index, 1);
}

const fetchData = async () => {
    try {
        const res = await api.fetch('/admin/auto_cleanup');
        if (res) Object.assign(cleanupModel.value, res);
        if (!cleanupModel.value.customSqlCleanupList) {
            cleanupModel.value.customSqlCleanupList = [];
        }
    } catch (error) {
        message.error(error.message || "error");
    }
}

const save = async () => {
    try {
        await api.fetch('/admin/auto_cleanup', {
            method: 'POST',
            body: JSON.stringify(cleanupModel.value)
        });
        message.success(t('saveSuccess'));
    } catch (error) {
        message.error(error.message || "error");
    }
}

onMounted(async () => {
    await fetchData();
})
</script>


<template>
    <div class="maintenance-page">
        <div class="page-head">
            <h2>{{ t('pageTitle') }}</h2>
            <p>{{ t('pageDesc') }}</p>
        </div>

        <n-card :bordered="false" embedded :title="t('autoCleanup')" style="margin-bottom: 12px;">
            <div class="cron-note">
                {{ t('cronNotePrefix') }} <code>0 0 * * *</code>{{ t('cronNoteSuffix') }}
            </div>
            <n-flex justify="end" style="margin-top: 12px;">
                <n-button @click="save" type="primary" :loading="loading">
                    {{ t('save') }}
                </n-button>
            </n-flex>
            <n-tabs type="segment" style="margin-top: 16px;">
                <n-tab-pane name="basic" :tab="t('basicCleanup')">
                    <n-form :model="cleanupModel">
                        <div class="task-row"
                            :class="{ 'is-invalid': basicInvalid('enableMailsAutoCleanup', 'cleanMailsDays') }">
                            <n-form-item-row :label="t('mailBoxLabel')">
                                <n-checkbox v-model:checked="cleanupModel.enableMailsAutoCleanup">
                                    {{ t('autoCleanup') }}
                                </n-checkbox>
                                <n-input-number v-model:value="cleanupModel.cleanMailsDays" :placeholder="t('tip')" />
                                <n-button @click="cleanup('mails', cleanupModel.cleanMailsDays)">
                                    <template #icon>
                                        <n-icon :component="CleaningServicesFilled" />
                                    </template>
                                    {{ t('cleanupNow') }}
                                </n-button>
                            </n-form-item-row>
                            <span v-if="basicInvalid('enableMailsAutoCleanup', 'cleanMailsDays')"
                                class="invalid-pill">{{ t('invalid') }}</span>
                        </div>
                        <div class="task-row"
                            :class="{ 'is-invalid': basicInvalid('enableUnknowMailsAutoCleanup', 'cleanUnknowMailsDays') }">
                            <n-form-item-row :label="t('mailUnknowLabel')">
                                <n-checkbox v-model:checked="cleanupModel.enableUnknowMailsAutoCleanup">
                                    {{ t('autoCleanup') }}
                                </n-checkbox>
                                <n-input-number v-model:value="cleanupModel.cleanUnknowMailsDays"
                                    :placeholder="t('tip')" />
                                <n-button @click="cleanup('mails_unknow', cleanupModel.cleanUnknowMailsDays)">
                                    <template #icon>
                                        <n-icon :component="CleaningServicesFilled" />
                                    </template>
                                    {{ t('cleanupNow') }}
                                </n-button>
                            </n-form-item-row>
                            <span v-if="basicInvalid('enableUnknowMailsAutoCleanup', 'cleanUnknowMailsDays')"
                                class="invalid-pill">{{ t('invalid') }}</span>
                        </div>
                        <div class="task-row"
                            :class="{ 'is-invalid': basicInvalid('enableSendBoxAutoCleanup', 'cleanSendBoxDays') }">
                            <n-form-item-row :label="t('sendBoxLabel')">
                                <n-checkbox v-model:checked="cleanupModel.enableSendBoxAutoCleanup">
                                    {{ t('autoCleanup') }}
                                </n-checkbox>
                                <n-input-number v-model:value="cleanupModel.cleanSendBoxDays" :placeholder="t('tip')" />
                                <n-button @click="cleanup('sendbox', cleanupModel.cleanSendBoxDays)">
                                    <template #icon>
                                        <n-icon :component="CleaningServicesFilled" />
                                    </template>
                                    {{ t('cleanupNow') }}
                                </n-button>
                            </n-form-item-row>
                            <span v-if="basicInvalid('enableSendBoxAutoCleanup', 'cleanSendBoxDays')"
                                class="invalid-pill">{{ t('invalid') }}</span>
                        </div>
                        <div class="task-row"
                            :class="{ 'is-invalid': basicInvalid('enableAddressAutoCleanup', 'cleanAddressDays') }">
                            <n-form-item-row :label="t('addressCreateLabel')">
                                <n-checkbox v-model:checked="cleanupModel.enableAddressAutoCleanup">
                                    {{ t('autoCleanup') }}
                                </n-checkbox>
                                <n-input-number v-model:value="cleanupModel.cleanAddressDays" :placeholder="t('tip')" />
                                <n-button @click="cleanup('addressCreated', cleanupModel.cleanAddressDays)">
                                    <template #icon>
                                        <n-icon :component="CleaningServicesFilled" />
                                    </template>
                                    {{ t('cleanupNow') }}
                                </n-button>
                            </n-form-item-row>
                            <span v-if="basicInvalid('enableAddressAutoCleanup', 'cleanAddressDays')"
                                class="invalid-pill">{{ t('invalid') }}</span>
                        </div>
                        <div class="task-row"
                            :class="{ 'is-invalid': basicInvalid('enableInactiveAddressAutoCleanup', 'cleanInactiveAddressDays') }">
                            <n-form-item-row :label="t('inactiveAddressLabel')">
                                <n-checkbox v-model:checked="cleanupModel.enableInactiveAddressAutoCleanup">
                                    {{ t('autoCleanup') }}
                                </n-checkbox>
                                <n-input-number v-model:value="cleanupModel.cleanInactiveAddressDays"
                                    :placeholder="t('tip')" />
                                <n-button @click="cleanup('inactiveAddress', cleanupModel.cleanInactiveAddressDays)">
                                    <template #icon>
                                        <n-icon :component="CleaningServicesFilled" />
                                    </template>
                                    {{ t('cleanupNow') }}
                                </n-button>
                            </n-form-item-row>
                            <span v-if="basicInvalid('enableInactiveAddressAutoCleanup', 'cleanInactiveAddressDays')"
                                class="invalid-pill">{{ t('invalid') }}</span>
                        </div>
                        <div class="task-row"
                            :class="{ 'is-invalid': basicInvalid('enableUnboundAddressAutoCleanup', 'cleanUnboundAddressDays') }">
                            <n-form-item-row :label="t('unboundAddressLabel')">
                                <n-checkbox v-model:checked="cleanupModel.enableUnboundAddressAutoCleanup">
                                    {{ t('autoCleanup') }}
                                </n-checkbox>
                                <n-input-number v-model:value="cleanupModel.cleanUnboundAddressDays"
                                    :placeholder="t('tip')" />
                                <n-button @click="cleanup('unboundAddress', cleanupModel.cleanUnboundAddressDays)">
                                    <template #icon>
                                        <n-icon :component="CleaningServicesFilled" />
                                    </template>
                                    {{ t('cleanupNow') }}
                                </n-button>
                            </n-form-item-row>
                            <span v-if="basicInvalid('enableUnboundAddressAutoCleanup', 'cleanUnboundAddressDays')"
                                class="invalid-pill">{{ t('invalid') }}</span>
                        </div>
                        <div class="task-row"
                            :class="{ 'is-invalid': basicInvalid('enableEmptyAddressAutoCleanup', 'cleanEmptyAddressDays') }">
                            <n-form-item-row :label="t('emptyAddressLabel')">
                                <n-checkbox v-model:checked="cleanupModel.enableEmptyAddressAutoCleanup">
                                    {{ t('autoCleanup') }}
                                </n-checkbox>
                                <n-input-number v-model:value="cleanupModel.cleanEmptyAddressDays"
                                    :placeholder="t('tip')" />
                                <n-button @click="cleanup('emptyAddress', cleanupModel.cleanEmptyAddressDays)">
                                    <template #icon>
                                        <n-icon :component="CleaningServicesFilled" />
                                    </template>
                                    {{ t('cleanupNow') }}
                                </n-button>
                            </n-form-item-row>
                            <span v-if="basicInvalid('enableEmptyAddressAutoCleanup', 'cleanEmptyAddressDays')"
                                class="invalid-pill">{{ t('invalid') }}</span>
                        </div>
                    </n-form>
                </n-tab-pane>
                <n-tab-pane name="custom_sql" :tab="t('customSqlCleanup')">
                    <n-alert :show-icon="false" :bordered="false" type="info" style="margin-bottom: 16px;">
                        <span>{{ t('customSqlTip') }}</span>
                    </n-alert>
                    <n-space vertical>
                        <n-card v-for="(item, index) in cleanupModel.customSqlCleanupList" :key="item.id" size="small"
                            :class="{ 'is-invalid': isInvalidTask(item) }">
                            <n-space vertical>
                                <n-space align="center">
                                    <n-checkbox v-model:checked="item.enabled">
                                        {{ t('autoCleanup') }}
                                    </n-checkbox>
                                    <n-input v-model:value="item.name" :placeholder="t('sqlNamePlaceholder')"
                                        style="width: 200px;" />
                                    <span v-if="isInvalidTask(item)" class="invalid-pill">{{ t('invalid') }}</span>
                                    <n-button @click="removeCustomSql(index)" type="error" quaternary>
                                        <template #icon>
                                            <n-icon :component="DeleteFilled" />
                                        </template>
                                        {{ t('deleteCustomSql') }}
                                    </n-button>
                                </n-space>
                                <n-input
                                    v-model:value="item.sql"
                                    type="textarea"
                                    :placeholder="t('sqlPlaceholder')"
                                    :autosize="{ minRows: 2 }"
                                    class="sql-input"
                                />
                            </n-space>
                        </n-card>
                        <n-button @click="addCustomSql">
                            <template #icon>
                                <n-icon :component="AddFilled" />
                            </template>
                            {{ t('addCustomSql') }}
                        </n-button>
                    </n-space>
                </n-tab-pane>
            </n-tabs>
        </n-card>
    </div>
</template>

<style scoped>
.maintenance-page .page-head {
    margin-bottom: 12px;
}

.maintenance-page .page-head h2 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 4px;
}

.maintenance-page .page-head p {
    font-size: 12.5px;
    opacity: 0.6;
    line-height: 1.6;
}

/* 灰色使用提示，cron 表达式用等宽字体 */
.cron-note {
    font-size: 12.5px;
    opacity: 0.65;
    line-height: 1.7;
}

.cron-note code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12.5px;
    padding: 1px 5px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 4px;
    opacity: 1;
}

/* 无效项：整体置灰 + 灰色描边「无效」小标签（不隐藏、不标红） */
.task-row {
    position: relative;
}

.task-row.is-invalid,
.maintenance-page :deep(.n-card.is-invalid) {
    opacity: 0.55;
}

.invalid-pill {
    display: inline-block;
    font-size: 11px;
    line-height: 1;
    padding: 3px 7px;
    border: 1px solid rgba(128, 128, 128, 0.55);
    border-radius: 999px;
    color: rgba(128, 128, 128, 0.95);
    white-space: nowrap;
}

.task-row .invalid-pill {
    position: absolute;
    top: 2px;
    right: 0;
}

.sql-input {
    text-align: left;
}
</style>
