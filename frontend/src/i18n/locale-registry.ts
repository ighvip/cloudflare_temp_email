import {
  dateEnUS,
  dateJaJP,
  dateZhCN,
  dateZhTW,
  enUS,
  jaJP,
  zhCN,
  zhTW,
} from 'naive-ui'

import type { NDateLocale, NLocale } from 'naive-ui'

type NaiveLocaleConfig = {
  locale: NLocale
  dateLocale: NDateLocale
}

type LocaleRegistryEntry = {
  locale: string
  label: string
  browserMatches: string[]
  naive: NaiveLocaleConfig
  turnstileLocale: string
}

export const LOCALE_REGISTRY = [
  {
    locale: 'zh',
    label: '简体中文',
    browserMatches: ['zh'],
    naive: { locale: zhCN, dateLocale: dateZhCN },
    turnstileLocale: 'zh-CN',
  },
  {
    locale: 'zh-TW',
    label: '繁體中文',
    browserMatches: ['zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO'],
    naive: { locale: zhTW, dateLocale: dateZhTW },
    // Cloudflare Turnstile has no Traditional Chinese pack, zh-CN is the closest
    turnstileLocale: 'zh-CN',
  },
  {
    locale: 'en',
    label: 'English',
    browserMatches: ['en'],
    naive: { locale: enUS, dateLocale: dateEnUS },
    turnstileLocale: 'en',
  },
  {
    locale: 'ko',
    label: '한국어',
    browserMatches: ['ko'],
    naive: { locale: zhCN, dateLocale: dateZhCN },
    turnstileLocale: 'ko',
  },
  {
    locale: 'ja',
    label: '日本語',
    browserMatches: ['ja'],
    naive: { locale: jaJP, dateLocale: dateJaJP },
    turnstileLocale: 'ja',
  },
] as const satisfies readonly LocaleRegistryEntry[]

export type SupportedLocale = (typeof LOCALE_REGISTRY)[number]['locale']

export const SUPPORTED_LOCALES = LOCALE_REGISTRY.map(({ locale }) => locale) as SupportedLocale[]

const localeRegistryMap = Object.fromEntries(
  LOCALE_REGISTRY.map((entry) => [entry.locale, entry]),
) as Record<SupportedLocale, (typeof LOCALE_REGISTRY)[number]>

export const getLocaleRegistryEntry = (locale: SupportedLocale) => {
  return localeRegistryMap[locale]
}

export const getLocaleLabel = (locale: SupportedLocale) => {
  return getLocaleRegistryEntry(locale).label
}

export const getLocaleOptions = () => {
  return LOCALE_REGISTRY.map(({ locale, label }) => ({
    label,
    value: locale,
    key: locale,
  }))
}

export const getNaiveLocaleConfig = (locale: SupportedLocale) => {
  return getLocaleRegistryEntry(locale).naive
}

export const getTurnstileLocale = (locale: SupportedLocale) => {
  return getLocaleRegistryEntry(locale).turnstileLocale
}

