<script setup>
/**
 * 问题9: shared empty state for the redesigned admin mail pages.
 * One transparent line-art drawing (1.5px strokes, fill none, currentColor
 * so it flips black -> white with the theme) over a single line of grey
 * text — replaces naive-ui's default n-result illustration.
 */
defineProps({
    title: {
        type: String,
        default: '',
    },
    // 'inbox' (received mail) | 'sent' (outbox)
    variant: {
        type: String,
        default: 'inbox',
    },
})
</script>

<template>
    <div class="empty-state" role="status">
        <!-- empty inbox: an envelope dropping into a tray -->
        <svg v-if="variant !== 'sent'" class="empty-art" viewBox="0 0 120 96" fill="none" stroke="currentColor"
            stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="44" y="12" width="32" height="24" rx="3" />
            <path d="M44 15 L60 27 L76 15" />
            <path d="M14 52 h26 l8 12 h24 l8 -12 h26 v24 a6 6 0 0 1 -6 6 H20 a6 6 0 0 1 -6 -6 Z" />
        </svg>
        <!-- empty outbox: a paper plane that has not flown yet -->
        <svg v-else class="empty-art" viewBox="0 0 120 96" fill="none" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M102 14 L12 52 L44 64 L54 88 L66 58 Z" />
            <path d="M102 14 L44 64" />
        </svg>
        <p v-if="title" class="empty-text">{{ title }}</p>
    </div>
</template>

<style scoped>
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 44px 16px 52px;
    text-align: center;
    color: #1a1a1a;
}

:global(html.dark .empty-state) {
    color: #eeeeee;
}

.empty-art {
    width: 112px;
    height: auto;
    opacity: 0.85;
}

.empty-text {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: #666666;
}

:global(html.dark .empty-text) {
    color: #9a9a9a;
}
</style>
