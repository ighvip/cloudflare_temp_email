// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { NMessageProvider } from 'naive-ui'

import i18n from '../../../i18n'
import { useGlobalState } from '../../../store'
import { api } from '../../../api'
import AccountSettings from '../AccountSettings.vue'

vi.mock('../../../api', () => ({
    api: { fetch: vi.fn() },
}))

const SETTINGS = {
    blockList: ['spam'],
    sendBlockList: ['spam', 'ads'],
    fromBlockList: ['bad-sender'],
    keywordFilterList: ['spam', 'ads', 'bad-sender'],
    kvEnabled: true,
    verifiedAddressList: ['verified@example.com'],
    noLimitSendAddressList: [],
    emailRuleSettings: {
        blockReceiveUnknowAddressEmail: true,
        emailForwardingList: [
            { domains: ['a.example.com'], forward: 'f@example.com', sourcePatterns: [], sourceMatchMode: 'any' }
        ],
    },
    sendMailLimitConfig: { dailyEnabled: true, monthlyEnabled: false, dailyLimit: 100, monthlyLimit: null },
    addressCreationSubdomainMatchStatus: {
        envConfigured: false, envEnabled: true, storedEnabled: true, effectiveEnabled: true,
    },
}

const SECTION_TITLES = ['收信过滤', '关键词过滤', '转发', '发信', '地址创建']

const flush = async () => {
    for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
    }
}

const mountPage = async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({
        render: () => h(NMessageProvider, null, { default: () => h(AccountSettings) }),
    })
    app.use(i18n)
    app.mount(el)
    await flush()
    const root = el
    const cards = () => Array.from(root.querySelectorAll('.section-card'))
    const text = () => root.textContent || ''
    const unmount = () => {
        app.unmount()
        el.remove()
    }
    return { root, cards, text, unmount }
}

beforeAll(() => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }))
    global.ResizeObserver = class {
        observe() { }
        unobserve() { }
        disconnect() { }
    }
})

beforeEach(() => {
    const { openSettings } = useGlobalState()
    openSettings.value.enableSendMail = false
    api.fetch.mockReset()
    api.fetch.mockResolvedValue(SETTINGS)
})

describe('admin AccountSettings sections', () => {
    it('renders five cards, each with exactly one usage line', async () => {
        const page = await mountPage()
        try {
            const cards = page.cards()
            expect(cards).toHaveLength(5)
            expect(cards.map((card) => card.querySelector('.n-card-header__main')?.textContent?.trim()))
                .toEqual(SECTION_TITLES)
            for (const card of cards) {
                expect(card.querySelectorAll('.acc-usage')).toHaveLength(1)
            }
            expect(page.text()).toContain('已配置 1 条转发规则')
        } finally {
            page.unmount()
        }
    })

    it('collapses and greys the send card when sending is disabled, restores it when enabled', async () => {
        const page = await mountPage()
        try {
            const sendCard = page.cards()[3]
            expect(sendCard.className).toContain('is-off')
            expect(sendCard.textContent).toContain('发信功能未启用')
            expect(sendCard.querySelectorAll('input')).toHaveLength(0)
            expect(sendCard.querySelectorAll('button')).toHaveLength(0)

            useGlobalState().openSettings.value.enableSendMail = true
            await nextTick()
            const onCard = page.cards()[3]
            expect(onCard.className).not.toContain('is-off')
            expect(onCard.textContent).not.toContain('发信功能未启用')
            expect(onCard.querySelectorAll('input').length).toBeGreaterThan(0)
        } finally {
            page.unmount()
        }
    })

    it('answers the keyword tester from the merged list', async () => {
        const page = await mountPage()
        try {
            const input = page.root.querySelector('input[placeholder="输入地址或邮件主题"]')
            expect(input).toBeTruthy()

            const type = async (value) => {
                input.value = value
                input.dispatchEvent(new Event('input', { bubbles: true }))
                await nextTick()
            }

            await type('spammer@example.com')
            expect(page.text()).toContain('不通过，命中关键词：spam')

            await type('hello@example.com')
            expect(page.text()).toContain('通过，未命中任何关键词')
        } finally {
            page.unmount()
        }
    })

    it('saves only its own section payload', async () => {
        const page = await mountPage()
        try {
            const [, keywordCard, , , addressCard] = page.cards()

            await keywordCard.querySelector('button').click()
            await flush()
            const keywordPosts = api.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')
            expect(keywordPosts).toHaveLength(1)
            expect(JSON.parse(keywordPosts[0][1].body))
                .toEqual({ keywordFilterList: ['spam', 'ads', 'bad-sender'] })

            await addressCard.querySelector('button').click()
            await flush()
            const posts = api.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')
            expect(posts).toHaveLength(2)
            expect(JSON.parse(posts[1][1].body))
                .toEqual({ addressCreationSettings: { enableSubdomainMatch: true } })
            expect(page.text()).not.toContain('保存失败')
        } finally {
            page.unmount()
        }
    })

    it('maps an api failure to the offending section only', async () => {
        api.fetch.mockImplementation((path, options) => {
            if (options?.method === 'POST') {
                return Promise.reject(new Error('[400]: 请先启用 KV'))
            }
            return Promise.resolve(SETTINGS)
        })
        const page = await mountPage()
        try {
            const [receiveCard, keywordCard] = page.cards()
            await keywordCard.querySelector('button').click()
            await flush()

            expect(keywordCard.textContent).toContain('保存失败：[400]: 请先启用 KV')
            expect(receiveCard.textContent).not.toContain('保存失败')
            // 失败不会回滚本地编辑
            expect(keywordCard.querySelectorAll('input').length).toBeGreaterThan(0)
        } finally {
            page.unmount()
        }
    })
})
