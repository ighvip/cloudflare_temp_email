import { ref } from 'vue'

import { LOCALE_REGISTRY, SUPPORTED_LOCALES } from './locale-registry'
import { APP_CONFIG } from '../config'

export { SUPPORTED_LOCALES } from './locale-registry'
export type { SupportedLocale } from './locale-registry'

import type { SupportedLocale } from './locale-registry'

export const FALLBACK_LOCALE: SupportedLocale = 'zh'
export const PREFERRED_LOCALE_STORAGE_KEY = 'preferredLocale'
export const EMPTY_LOCALE_MESSAGES = Object.fromEntries(
  SUPPORTED_LOCALES.map((supportedLocale) => [supportedLocale, {}]),
) as Record<SupportedLocale, Record<string, never>>

/**
 * Admin-selected default language, delivered asynchronously by
 * `/open_settings`. Empty means "not configured".
 */
export const siteDefaultLocale = ref<SupportedLocale | ''>('')

export const setSiteDefaultLocale = (value: unknown) => {
  siteDefaultLocale.value = isSupportedLocale(value) ? value : ''
}

export const isSupportedLocale = (locale: unknown): locale is SupportedLocale => {
  return typeof locale === 'string' && SUPPORTED_LOCALES.includes(locale as SupportedLocale)
}

export const resolveSupportedLocale = (locale: string | null | undefined): SupportedLocale | null => {
  if (!locale) return null
  const normalizedLocale = locale.trim().toLowerCase()

  for (const supportedLocale of SUPPORTED_LOCALES) {
    if (supportedLocale.toLowerCase() === normalizedLocale) {
      return supportedLocale
    }
  }

  return null
}

export const DEFAULT_LOCALE: SupportedLocale = resolveSupportedLocale(APP_CONFIG.DEFAULT_LANG)
  || FALLBACK_LOCALE

export const matchSupportedLocale = (locale: string | null | undefined): SupportedLocale | null => {
  if (!locale) return null
  const normalizedLocale = locale.trim().toLowerCase()

  // Prefer the longest matching prefix so `zh-TW` / `zh-Hant-TW` resolve to
  // Traditional Chinese instead of falling through to the generic `zh` entry.
  let best: SupportedLocale | null = null
  let bestPrefixLength = -1

  for (const entry of LOCALE_REGISTRY) {
    for (const prefix of entry.browserMatches) {
      const normalizedPrefix = prefix.toLowerCase()
      const matched = normalizedLocale === normalizedPrefix
        || normalizedLocale.startsWith(`${normalizedPrefix}-`)
      if (!matched) continue
      if (normalizedPrefix.length > bestPrefixLength) {
        bestPrefixLength = normalizedPrefix.length
        best = entry.locale
      }
    }
  }

  return best
}

export const getBrowserLocales = (): string[] => {
  if (typeof navigator === 'undefined') return []

  const locales = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language]

  return locales.filter(Boolean)
}

export const getStoredLocale = (): SupportedLocale | '' => {
  if (typeof window === 'undefined') return ''

  const locale = window.localStorage.getItem(PREFERRED_LOCALE_STORAGE_KEY)
  return isSupportedLocale(locale) ? locale : ''
}

export const getPreferredLocale = (
  storedLocale: string | null | undefined,
  browserLocales: string[] = [],
): SupportedLocale => {
  if (isSupportedLocale(storedLocale)) return storedLocale

  for (const browserLocale of browserLocales) {
    const matchedLocale = matchSupportedLocale(browserLocale)
    if (matchedLocale) return matchedLocale
  }

  return FALLBACK_LOCALE
}

export const getInitialLocale = () => DEFAULT_LOCALE

/**
 * Locale to use when the URL carries no `/:lang/` prefix.
 *
 * Priority: a language the visitor picked themselves > the admin-configured
 * default > whatever the browser reports > the build default.
 *
 * Deliberately does NOT remember the browser guess in localStorage, otherwise
 * it would outrank the admin default on every later visit.
 */
export const resolveLocaleWithoutRoute = (): SupportedLocale => {
  const stored = getStoredLocale()
  if (stored) return stored
  if (siteDefaultLocale.value) return siteDefaultLocale.value

  for (const browserLocale of getBrowserLocales()) {
    const matched = matchSupportedLocale(browserLocale)
    if (matched) return matched
  }

  return DEFAULT_LOCALE
}

const splitPathSuffix = (fullPath: string) => {
  const match = fullPath.match(/^([^?#]*)(.*)$/)
  return {
    path: match?.[1] || '/',
    suffix: match?.[2] || '',
  }
}

export const stripLocaleFromPath = (path: string): string => {
  if (!path || path === '/') return '/'

  const pathLocale = resolveSupportedLocale(path.split('/')[1])
  if (!pathLocale) {
    return path
  }

  const localePrefix = `/${path.split('/')[1]}`
  if (path === localePrefix || path === `${localePrefix}/`) {
    return '/'
  }
  if (path.startsWith(`${localePrefix}/`)) {
    return path.slice(localePrefix.length) || '/'
  }

  return path
}

export const getPathWithLocale = (path: string, locale: SupportedLocale): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const basePath = stripLocaleFromPath(normalizedPath)

  if (locale === DEFAULT_LOCALE) {
    return basePath
  }

  if (basePath === '/') {
    return `/${locale}/`
  }

  return `/${locale}${basePath}`
}

export const replaceLocaleInFullPath = (fullPath: string, locale: SupportedLocale): string => {
  const { path, suffix } = splitPathSuffix(fullPath)
  return `${getPathWithLocale(path, locale)}${suffix}`
}

const getLocaleAliasPath = (path: string, locale: SupportedLocale): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const basePath = stripLocaleFromPath(normalizedPath)

  if (locale === DEFAULT_LOCALE) {
    if (basePath === '/') {
      return `/${locale}/`
    }

    return `/${locale}${basePath}`
  }

  return getPathWithLocale(basePath, locale)
}
