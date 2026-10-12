<script setup>
import { ref, h, onMounted, watch, computed } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { NButton, NPopconfirm, NTag } from 'naive-ui'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import EmptyState from '../../components/EmptyState.vue'

const { loading, useUTCDate } = useGlobalState()
const message = useMessage()

const { t } = useScopedI18n('views.admin.SendLog')

const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)

const addressQuery = ref('')
const statusQuery = ref('all')

// 清理过期日志（保留天数）
const cleanupDays = ref(30)

// 问题9: 与 Mails/SendBox 一致，空列表时用共享的线稿空状态替换表格自带空态
const listEmpty = ref(false)

const statusOptions = computed(() => [
  { label: t('filterAll'), value: 'all' },
  { label: t('statusSuccess'), value: 'success' },
  { label: t('statusFailed'), value: 'failed' },
])

const fetchData = async () => {
  try {
    addressQuery.value = addressQuery.value.trim()
    const params = [
      `limit=${pageSize.value}`,
      `offset=${(page.value - 1) * pageSize.value}`,
    ]
    if (addressQuery.value) params.push(`address=${encodeURIComponent(addressQuery.value)}`)
    if (statusQuery.value !== 'all') params.push(`status=${statusQuery.value}`)
    const res = await api.fetch(`/admin/send_log?${params.join('&')}`)
    data.value = res?.results || []
    count.value = res?.count || 0
    listEmpty.value = !res || (!(res.count > 0) && !(res.results?.length > 0))
  } catch (error) {
    listEmpty.value = false
    console.log(error)
    message.error(error.message || 'error')
  }
}

const query = async () => {
  page.value = 1
  await fetchData()
}

const removeLog = async (id) => {
  try {
    await api.fetch(`/admin/send_log/${id}`, { method: 'DELETE' })
    message.success(t('deleteSuccess'))
    await fetchData()
  } catch (error) {
    message.error(error.message || 'error')
  }
}

const clearAll = async () => {
  try {
    await api.fetch(`/admin/send_log/clear`, { method: 'POST' })
    message.success(t('clearSuccess'))
    page.value = 1
    await fetchData()
  } catch (error) {
    message.error(error.message || 'error')
  }
}

const cleanupOld = async () => {
  const days = Number(cleanupDays.value)
  if (!Number.isInteger(days) || days < 0 || days > 1000) {
    message.warning(t('cleanupTip'))
    return
  }
  try {
    await api.fetch(`/admin/cleanup`, {
      method: 'POST',
      body: JSON.stringify({ cleanType: 'send_log', cleanDays: days })
    })
    message.success(t('cleanupSuccess'))
    await fetchData()
  } catch (error) {
    message.error(error.message || 'error')
  }
}

const columns = [
  {
    title: 'ID',
    key: 'id',
    width: 70
  },
  {
    title: t('address'),
    key: 'address'
  },
  {
    title: t('to'),
    key: 'to_mail',
    render(row) {
      return row.to_mail || '-'
    }
  },
  {
    title: t('subject'),
    key: 'subject',
    ellipsis: { tooltip: true }
  },
  {
    title: t('channel'),
    key: 'channel',
    render(row) {
      return row.channel || '-'
    }
  },
  {
    title: t('status'),
    key: 'status',
    render(row) {
      const ok = row.status === 'success'
      return h(NTag, { type: ok ? 'success' : 'error', size: 'small', bordered: false },
        { default: () => ok ? t('statusSuccess') : t('statusFailed') })
    }
  },
  {
    title: t('error'),
    key: 'error',
    ellipsis: { tooltip: true },
    render(row) {
      return row.error || ''
    }
  },
  {
    title: t('createdAt'),
    key: 'created_at',
    render(row) {
      return utcToLocalDate(row.created_at, useUTCDate.value)
    }
  },
  {
    title: '',
    key: 'actions',
    width: 100,
    render(row) {
      return h('div', [
        h(NPopconfirm,
          {
            onPositiveClick: () => removeLog(row.id)
          },
          {
            trigger: () => h(NButton,
              {
                tertiary: true,
                size: 'small',
                type: 'error',
              },
              { default: () => t('delete') }
            ),
            default: () => t('deleteTip')
          }
        ),
      ])
    }
  }
]

watch([page, pageSize], async () => {
  await fetchData()
})

onMounted(async () => {
  await fetchData()
})
</script>

<template>
  <div class="admin-page">
    <div class="page-head">
      <div class="page-head-row">
        <span class="page-sq" aria-hidden="true"></span>
        <h2>{{ t('pageTitle') }}</h2>
        <span class="page-badge">ADMIN</span>
      </div>
      <p class="page-desc">{{ t('pageDesc') }}</p>
    </div>

    <section class="page-card">
      <div class="page-toolbar">
        <n-input-group>
          <n-input v-model:value="addressQuery" :placeholder="t('addressPlaceholder')"
            @keydown.enter="query" clearable />
          <n-select v-model:value="statusQuery" :options="statusOptions" style="width: 130px;"
            @update:value="query" />
          <n-button @click="query" type="primary">
            {{ t('query') }}
          </n-button>
        </n-input-group>
        <div class="toolbar-right">
          <n-button quaternary size="small" @click="fetchData">
            {{ t('refresh') }}
          </n-button>
          <n-popover trigger="click" :show-arrow="false">
            <template #trigger>
              <n-button tertiary size="small">
                {{ t('cleanup') }}
              </n-button>
            </template>
            <n-flex vertical :size="8" style="width: 220px;">
              <span>{{ t('cleanupTip') }}</span>
              <n-input-number v-model:value="cleanupDays" :min="0" :max="1000" />
              <n-button type="primary" size="small" :loading="loading" @click="cleanupOld">
                {{ t('cleanup') }}
              </n-button>
            </n-flex>
          </n-popover>
          <n-popconfirm @positive-click="clearAll">
            <template #trigger>
              <n-button tertiary size="small" type="error">
                {{ t('clear') }}
              </n-button>
            </template>
            {{ t('clearTip') }}
          </n-popconfirm>
        </div>
      </div>
      <n-data-table v-if="!listEmpty" class="log-table" :columns="columns" :data="data" :bordered="false" />
      <!-- 空列表：用共享线稿空状态替换表格自带空态 -->
      <EmptyState v-else variant="sent" :title="t('emptyTitle')" />
      <n-flex v-if="!listEmpty" justify="end" style="margin-top: 12px;">
        <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
          :page-sizes="[20, 50, 100]" show-size-picker>
          <template #prefix="{ itemCount }">
            {{ t('itemCount') }}: {{ itemCount }}
          </template>
        </n-pagination>
      </n-flex>
    </section>
  </div>
</template>

<style scoped>
/* ---- 问题9: homepage monochrome page chrome ---- */
.admin-page {
    width: min(960px, 100%);
    margin: 0 auto;
    padding: 14px 4px 24px;
    text-align: left;
}

.page-head {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
}

.page-head-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.page-sq {
    width: 11px;
    height: 11px;
    flex: 0 0 auto;
    background: currentColor;
}

.page-head h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.2px;
    line-height: 1.3;
}

.page-badge {
    margin-left: auto;
    padding: 1px 8px;
    border: 1px solid rgba(128, 128, 128, 0.45);
    border-radius: 999px;
    background: rgba(128, 128, 128, 0.10);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    white-space: nowrap;
}

.page-desc {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: #666666;
}

:global(html.dark .page-desc) {
    color: #9a9a9a;
}

.page-card {
    padding: 16px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

.page-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
}

.page-toolbar .n-input-group {
    width: min(560px, 100%);
}

.toolbar-right {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

/* homepage card language: hairline row separators + mono meta pills */
.log-table :deep(.n-data-table-th) {
    font-weight: 600;
}

.log-table :deep(.n-data-table-td) {
    border-bottom: 1px solid rgba(128, 128, 128, 0.10);
}

.log-table :deep(.n-tag),
.log-table :deep(.n-tag__content) {
    border-radius: 999px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
}
</style>