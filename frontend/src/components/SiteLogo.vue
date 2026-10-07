<template>
    <span class="site-logo" role="img" aria-label="logo">
        <svg class="site-logo-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- envelope body -->
            <rect class="logo-body" x="6" y="18" width="52" height="34" rx="6"
                stroke="currentColor" stroke-width="4" />
            <!-- flap -->
            <path class="logo-flap" d="M9 23 L32 40 L55 23" stroke="currentColor" stroke-width="4"
                stroke-linecap="round" stroke-linejoin="round" />
            <!-- letter slides out of the envelope on hover -->
            <rect class="logo-letter" x="22" y="6" width="20" height="16" rx="2"
                stroke="currentColor" stroke-width="3" />
            <path class="logo-line" d="M26 12 H38" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" />
            <path class="logo-line" d="M26 17 H34" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" />
        </svg>
    </span>
</template>

<style scoped>
.site-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    /* inherits the surrounding text colour, so it works in light + dark mode */
    color: inherit;
    transition: transform 0.25s ease;
}

.site-logo-svg {
    width: 100%;
    height: 100%;
    overflow: visible;
}

.logo-body,
.logo-flap,
.logo-letter,
.logo-line {
    transition: transform 0.3s ease, opacity 0.3s ease;
    transform-origin: 32px 34px;
}

.logo-letter,
.logo-line {
    opacity: 0;
    transform: translateY(8px);
}

/* hover: the flap lifts and the letter slides out of the envelope */
.site-logo:hover {
    transform: scale(1.08);
}

.site-logo:hover .logo-flap {
    transform: rotate(-14deg) translateY(-3px);
}

.site-logo:hover .logo-letter,
.site-logo:hover .logo-line {
    opacity: 1;
    transform: translateY(-2px);
}

.site-logo:active {
    transform: scale(0.94);
}
</style>
