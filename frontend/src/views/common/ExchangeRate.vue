<script setup>
import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import { api } from '../../api'
import { useScopedI18n } from '@/i18n/app'

import cnFlag from '@/assets/flags/cn.svg'
import usFlag from '@/assets/flags/us.svg'
import euFlag from '@/assets/flags/eu.svg'
import jpFlag from '@/assets/flags/jp.svg'
import hkFlag from '@/assets/flags/hk.svg'
import gbFlag from '@/assets/flags/gb.svg'
import krFlag from '@/assets/flags/kr.svg'
import auFlag from '@/assets/flags/au.svg'
import caFlag from '@/assets/flags/ca.svg'
import moFlag from '@/assets/flags/mo.svg'
import thFlag from '@/assets/flags/th.svg'
import twFlag from '@/assets/flags/tw.svg'

const { t } = useScopedI18n('views.common.ExchangeRate')

// 12 currencies, same order as the worker EXCHANGE_CURRENCIES list
const CURRENCIES = [
    { code: 'CNY', flag: cnFlag },
    { code: 'USD', flag: usFlag },
    { code: 'EUR', flag: euFlag },
    { code: 'JPY', flag: jpFlag },
    { code: 'HKD', flag: hkFlag },
    { code: 'GBP', flag: gbFlag },
    { code: 'KRW', flag: krFlag },
    { code: 'AUD', flag: auFlag },
    { code: 'CAD', flag: caFlag },
    { code: 'MOP', flag: moFlag },
    { code: 'THB', flag: thFlag },
    { code: 'TWD', flag: twFlag },
]
const FLAG_BY_CODE = Object.fromEntries(CURRENCIES.map((item) => [item.code, item.flag]))
const REFRESH_INTERVAL_MS = 60_000;

// { rates: { CNY: 1, USD: 6.68, ... } (1 unit = X CNY), updatedAt, source, stale }
const rates = ref(null)
const loading = ref(false)
const loadFailed = ref(false)
const from = ref('USD')
const to = ref('CNY')
const amount = ref(1)
let refreshTimer = null

const options = computed(() => CURRENCIES.map((item) => ({
    value: item.code,
    label: `${t(`currency_${item.code}`)} ${item.code}`,
    flag: item.flag,
})))

const currencyName = (code) => t(`currency_${code}`)

// naive-ui n-select takes render-label as a PROP (function), not a slot —
// draw "flag + name CODE" for both the selected value and dropdown options
const renderLabel = (option) => h('span', { class: 'er-option' }, [
    h('img', { class: 'er-flag', src: option.flag, alt: '' }),
    ` ${option.label}`,
])

const fetchRates = async (silent = false) => {
    if (!silent) loading.value = rates.value === null
    try {
        const res = await api.fetch('/open_api/exchange_rates', { showLoading: false })
        if (res?.rates) {
            rates.value = res
            loadFailed.value = false
        } else {
            loadFailed.value = true
        }
    } catch (error) {
        console.warn('exchange rates fetch failed', error)
        loadFailed.value = true
    } finally {
        loading.value = false
    }
}

// amount x from-rate(CNY) / to-rate(CNY), i.e. cross via the CNY hub
const converted = computed(() => {
    const table = rates.value?.rates
    const fromRate = table?.[from.value]
    const toRate = table?.[to.value]
    const value = Number(amount.value)
    if (!fromRate || !toRate || !Number.isFinite(value)) return null
    return value * fromRate / toRate
})

// rates >= 1 keep 4 decimals, smaller ones need 6 to stay honest (KRW etc.)
const formatRate = (rate) => (rate >= 1 ? rate.toFixed(4) : rate.toFixed(6))

const unitPreview = computed(() => {
    const table = rates.value?.rates
    if (!table) return []
    const pair = (a, b) => ({
        key: `${a}-${b}`,
        from: a,
        to: b,
        rate: table[a] && table[b] ? table[a] / table[b] : null,
    })
    return [pair(from.value, to.value), pair(to.value, from.value)]
})

const swap = () => {
    const previous = from.value
    from.value = to.value
    to.value = previous
}

const updatedLabel = computed(() => {
    const iso = rates.value?.updatedAt
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString([], {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })
})

const sourceLabel = computed(() => {
    const source = rates.value?.source
    return source ? t(`source_${source}`) : ''
})

onMounted(() => {
    fetchRates()
    // silent background refresh, same 60s TTL as the worker cache
    refreshTimer = setInterval(() => fetchRates(true), REFRESH_INTERVAL_MS)
})

onUnmounted(() => {
    if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
    <div class="exchange-rate">
        <n-spin :show="loading">
            <template v-if="rates && !loadFailed">
                <!-- bidirectional unit preview, FinScope style -->
                <div class="er-preview">
                    <div v-for="row in unitPreview" :key="row.key" class="er-preview-row">
                        <span class="er-preview-label">
                            1 {{ currencyName(row.from) }}
                            <span class="er-preview-code">{{ row.from }}</span>
                        </span>
                        <span class="er-preview-value">
                            ≈ {{ row.rate !== null ? formatRate(row.rate) : '-' }}
                            {{ currencyName(row.to) }}
                            <span class="er-preview-code">{{ row.to }}</span>
                        </span>
                    </div>
                </div>

                <!-- from row: currency picker + editable amount -->
                <div class="er-row">
                    <div class="er-select">
                        <n-select v-model:value="from" :options="options" filterable size="small"
                            :render-label="renderLabel" />
                    </div>
                    <div class="er-amount">
                        <n-input-number v-model:value="amount" :show-button="false" :min="0"
                            size="small" />
                    </div>
                </div>

                <div class="er-swap-row">
                    <n-button size="small" quaternary circle @click="swap" :title="t('swap')">
                        <template #icon>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
                                stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                stroke-linejoin="round">
                                <path d="M7 16V4M7 4L3 8M7 4l4 4" />
                                <path d="M17 8v12M17 20l4-4M17 20l-4-4" />
                            </svg>
                        </template>
                    </n-button>
                </div>

                <!-- to row: currency picker + readonly result -->
                <div class="er-row">
                    <div class="er-select">
                        <n-select v-model:value="to" :options="options" filterable size="small"
                            :render-label="renderLabel" />
                    </div>
                    <div class="er-amount er-result">
                        {{ converted !== null ? converted.toFixed(2) : '-' }}
                    </div>
                </div>

                <div class="er-meta">
                    <span v-if="updatedLabel">{{ t('updatedAt', { time: updatedLabel }) }}</span>
                    <span v-if="sourceLabel">{{ t('source', { source: sourceLabel }) }}</span>
                </div>
                <div class="er-stale" v-if="rates.stale">{{ t('staleHint') }}</div>
                <div class="er-disclaimer">{{ t('disclaimer') }}</div>
            </template>

            <div v-else-if="loadFailed && !rates" class="er-failed">
                <n-button size="small" secondary @click="fetchRates()">{{ t('retry') }}</n-button>
                <div class="er-disclaimer">{{ t('unavailable') }}</div>
            </div>
        </n-spin>
    </div>
</template>

<style scoped>
.exchange-rate {
    text-align: left;
}

/* bidirectional unit preview block */
.er-preview {
    border: 1px solid var(--n-border-color, rgba(128, 128, 128, 0.25));
    border-radius: 8px;
    padding: 8px 10px;
    margin-bottom: 10px;
    font-size: 12.5px;
}

.er-preview-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    padding: 2px 0;
}

.er-preview-label {
    opacity: 0.75;
    white-space: nowrap;
}

.er-preview-value {
    font-weight: 600;
    text-align: right;
    word-break: break-all;
}

.er-preview-code {
    font-size: 11px;
    opacity: 0.55;
    font-weight: 400;
}

/* picker + amount row, flex shrinks the amount box on narrow screens */
.er-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.er-select {
    flex: 1.15 1 0;
    min-width: 0;
}

.er-amount {
    flex: 1 1 0;
    min-width: 0;
}

.er-option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.er-flag {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    flex-shrink: 0;
}

.er-swap-row {
    display: flex;
    justify-content: center;
    margin: -2px 0 6px;
}

.er-result {
    border: 1px solid var(--n-border-color, rgba(128, 128, 128, 0.25));
    border-radius: 3px;
    min-height: 34px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.er-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 11.5px;
    opacity: 0.6;
    margin-top: 6px;
}

.er-stale {
    font-size: 11.5px;
    opacity: 0.75;
    margin-top: 4px;
}

.er-disclaimer {
    font-size: 11.5px;
    opacity: 0.5;
    margin-top: 2px;
}

.er-failed {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
}

@media (max-width: 480px) {
    .er-row {
        gap: 6px;
    }

    .er-preview {
        font-size: 12px;
    }
}
</style>
