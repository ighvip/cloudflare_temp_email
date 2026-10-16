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
// amount stays a string so an emptied box shows "-" instead of a fake 0
const amountText = ref('1')
let refreshTimer = null

// digits and at most one dot (naive n-input allow-input filter)
const permitNumber = (value) => !value || /^\d*\.?\d*$/.test(value)

const options = computed(() => CURRENCIES.map((item) => ({
    value: item.code,
    label: `${t(`currency_${item.code}`)} ${item.code}`,
    flag: item.flag,
})))

const currencyName = (code) => t(`currency_${code}`)

// naive-ui n-select takes render-label as a PROP (function), not a slot.
// The VNodes it creates are rendered inside naive-ui's subtree and never get
// this component's scoped-CSS data attribute, so scoped .er-flag rules would
// NOT apply (the img fell back to the SVG's native 512x512) — all sizing is
// therefore inlined here.
const FLAG_IMG_STYLE = {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    flexShrink: '0',
    display: 'block',
}
const OPTION_STYLE = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
}
const renderLabel = (option) => h('span', { style: OPTION_STYLE }, [
    h('img', { src: option.flag, alt: '', draggable: 'false', style: FLAG_IMG_STYLE }),
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
    const text = amountText.value.trim()
    const value = text ? Number(text) : NaN
    if (!fromRate || !toRate || !Number.isFinite(value)) return null
    return value * fromRate / toRate
})

const convertedText = computed(() => (
    converted.value !== null ? converted.value.toFixed(2) : ''
))

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

                <!-- from row: currency picker + editable amount, mirror of the row below -->
                <div class="er-row">
                    <div class="er-cell">
                        <n-select v-model:value="from" :options="options" filterable size="small"
                            :render-label="renderLabel" />
                    </div>
                    <div class="er-cell">
                        <n-input v-model:value="amountText" size="small" :allow-input="permitNumber"
                            placeholder="0" />
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

                <!-- to row: identical geometry so all four boxes align corner to corner -->
                <div class="er-row">
                    <div class="er-cell">
                        <n-select v-model:value="to" :options="options" filterable size="small"
                            :render-label="renderLabel" />
                    </div>
                    <div class="er-cell">
                        <n-input :value="convertedText" readonly size="small" placeholder="-" />
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

/* picker + amount row — both cells share one flex basis so the two rows
   form a strict 2-column grid (four boxes, four aligned corners) */
.er-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.er-cell {
    flex: 1 1 0;
    min-width: 0;
}

/* NOTE: the flag img + label wrapper inside n-select are rendered by
   renderLabel (a naive-ui PROP function) inside naive-ui's own subtree, so
   scoped .er-flag/.er-option rules can never match them — their size/radius
   are inlined in renderLabel instead. */

.er-swap-row {
    display: flex;
    justify-content: center;
    margin: -4px 0 2px;
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
