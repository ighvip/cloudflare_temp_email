<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../../store'

/**
 * Sci-fi terminal demo card: types out a generate → receive flow.
 * Uses the visitor's real address once one exists, a demo address before.
 */
const { settings, openSettings } = useGlobalState()
const { t } = useScopedI18n('views.Index')

const demoAddress = computed(() => {
    if (settings.value.address) return settings.value.address
    const domain = openSettings.value?.domains?.[0]?.value || 'example.com'
    return `tmp8f2k@${domain}`
})

const scriptLines = computed(() => ([
    { prompt: true, cls: '', text: t('termCmdNew') },
    { prompt: false, cls: 'term-ok', text: t('termOutNew', { address: demoAddress.value }) },
    { prompt: true, cls: '', text: t('termCmdWatch') },
    { prompt: false, cls: 'term-ok', text: t('termOutMail') },
    { prompt: false, cls: 'term-meta', text: t('termOutMeta') },
]))

const displayed = ref([])
const typing = ref('')
const typingCls = ref('')

let lineIndex = 0
let charIndex = 0
let timer = null
let stopped = false

const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const step = () => {
    if (stopped) return
    const lines = scriptLines.value
    if (lineIndex >= lines.length) {
        timer = setTimeout(() => {
            displayed.value = []
            lineIndex = 0
            charIndex = 0
            step()
        }, 4000)
        return
    }
    const line = lines[lineIndex]
    if (charIndex === 0) typingCls.value = line.cls
    if (charIndex < line.text.length) {
        charIndex += 1
        typing.value = line.text.slice(0, charIndex)
        timer = setTimeout(step, 20)
    } else {
        displayed.value = [...displayed.value, { ...line, text: line.text }]
        typing.value = ''
        lineIndex += 1
        charIndex = 0
        timer = setTimeout(step, 350)
    }
}

onMounted(() => {
    if (reducedMotion) {
        displayed.value = scriptLines.value.map((line) => ({ ...line }))
        return
    }
    step()
})

onUnmounted(() => {
    stopped = true
    if (timer) clearTimeout(timer)
})
</script>

<template>
    <div class="terminal" aria-hidden="true">
        <div class="terminal-bar">
            <span class="terminal-dot dot-red"></span>
            <span class="terminal-dot dot-yellow"></span>
            <span class="terminal-dot dot-green"></span>
            <span class="terminal-title">tempemail — demo</span>
        </div>
        <div class="terminal-body">
            <div v-for="(line, index) in displayed" :key="index" class="terminal-line" :class="line.cls">
                <span v-if="line.prompt" class="terminal-prompt">$ </span>{{ line.text }}
            </div>
            <div v-if="typing" class="terminal-line" :class="typingCls">
                <span v-if="lineIndex % 2 === 0" class="terminal-prompt">$ </span>{{ typing }}<span
                    class="terminal-caret"></span>
            </div>
            <div v-else class="terminal-line"><span class="terminal-caret"></span></div>
        </div>
    </div>
</template>

<style scoped>
.terminal {
    border: 1px solid rgba(128, 128, 128, 0.25);
    border-radius: 12px;
    overflow: hidden;
    background: #0d1117;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.terminal-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #161b22;
    border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}

.terminal-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
}

.dot-red { background: #ff5f56; }
.dot-yellow { background: #ffbd2e; }
.dot-green { background: #27c93f; }

.terminal-title {
    margin-left: 8px;
    font-size: 11px;
    color: #8b949e;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.terminal-body {
    padding: 14px 16px;
    min-height: 148px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.8;
    color: #c9d1d9;
    white-space: pre-wrap;
    word-break: break-all;
}

.terminal-prompt {
    color: #58a6ff;
}

.term-ok {
    color: #3fb950;
}

.term-meta {
    color: #8b949e;
}

.terminal-caret {
    display: inline-block;
    width: 8px;
    height: 15px;
    margin-left: 2px;
    vertical-align: text-bottom;
    background: #58a6ff;
    animation: terminal-blink 1s steps(1) infinite;
}

@keyframes terminal-blink {
    50% { opacity: 0; }
}
</style>
