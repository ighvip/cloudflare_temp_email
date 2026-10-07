import { getPathWithLocale } from '../i18n/utils'

export const hashPassword = async (password: string) => {
    // user crypto to hash password
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const getRouterPathWithLang = (path: string, lang: string) => {
    const normalizedLang = lang === 'en'
        || lang === 'es'
        || lang === 'pt-BR'
        || lang === 'ja'
        || lang === 'de'
        ? lang
        : 'zh';

    return getPathWithLocale(path, normalizedLang);
}

// P0 B1: local replacement for the esm.sh @faker-js/faker dynamic import.
// Keeps the previous shape (`word.word123`) without pulling a remote CDN module.
const RANDOM_NAME_ADJECTIVES = [
    'amber', 'bold', 'brave', 'calm', 'clever', 'crisp', 'eager', 'gentle',
    'happy', 'lucky', 'merry', 'mild', 'neat', 'polite', 'proud', 'quick',
    'quiet', 'rapid', 'shiny', 'smart', 'sunny', 'tidy', 'warm', 'wise',
];
const RANDOM_NAME_NOUNS = [
    'falcon', 'harbor', 'meadow', 'orchid', 'otter', 'pebble', 'quartz',
    'rabbit', 'raven', 'river', 'robin', 'sunrise', 'thunder', 'tiger',
    'willow', 'winter', 'cloud', 'comet', 'maple', 'ocean', 'pixel',
];
const pickRandom = (items: string[]) =>
    items[Math.floor(Math.random() * items.length)];

export const randomAddressName = () => {
    const digits = Math.floor(100 + Math.random() * 900);
    return `${pickRandom(RANDOM_NAME_ADJECTIVES)}.${pickRandom(RANDOM_NAME_NOUNS)}${digits}`;
}

export const utcToLocalDate = (utcDate: string | null | undefined, useUTCDate: boolean) => {
    if (!utcDate) return '';
    const utcDateString = `${utcDate} UTC`;
    if (useUTCDate) {
        return utcDateString;
    }
    try {
        const date = new Date(utcDateString);
        // if invalid date string
        if (isNaN(date.getTime())) return utcDateString;

        return date.toLocaleString();
    } catch (e) {
        console.error(e);
    }
    return utcDateString;
}
