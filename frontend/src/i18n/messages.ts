import { MESSAGE_REGISTRY, getMessageSource } from './message-registry'

import type { MessageKey, MessageNamespace } from './message-registry'

import { jaMessages } from './locales/source/ja'
import { koMessages } from './locales/source/ko'
// generated from the zh source by scripts/gen-zhtw.mjs
import { zhTWMessages } from './locales/source/zhTW'

import type { SupportedLocale } from './locale-registry'

type LocaleTree = Record<string, unknown>
type SourceLocale = Extract<SupportedLocale, 'en' | 'zh'>
type AdditionalLocale = Exclude<SupportedLocale, SourceLocale>

const additionalLocaleSources: Record<AdditionalLocale, Record<string, string>> = {
  ja: jaMessages,
  ko: koMessages,
  'zh-TW': zhTWMessages,
}

const setNestedValue = (target: LocaleTree, path: string, value: unknown) => {
  const segments = path.split('.')
  let current: LocaleTree = target

  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment]
    if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
      current = existing as LocaleTree
      continue
    }

    current[segment] = {}
    current = current[segment] as LocaleTree
  }

  current[segments.at(-1) as string] = value
}

const buildSourceLocaleMessages = (locale: SourceLocale) => {
  const messages: LocaleTree = {}

  for (const namespace of Object.keys(MESSAGE_REGISTRY) as MessageNamespace[]) {
    const keys = Object.keys(MESSAGE_REGISTRY[namespace]) as MessageKey<typeof namespace>[]
    for (const key of keys) {
      const message = getMessageSource(namespace, key, locale)
      if (message === undefined) continue
      setNestedValue(messages, `${namespace}.${key}`, message)
    }
  }

  return messages
}

const buildAdditionalLocaleMessages = (locale: AdditionalLocale) => {
  const messages: LocaleTree = {}

  for (const [key, value] of Object.entries(additionalLocaleSources[locale])) {
    setNestedValue(messages, key, value)
  }

  return messages
}

export const I18N_MESSAGES: Record<SupportedLocale, LocaleTree> = {
  zh: buildSourceLocaleMessages('zh'),
  en: buildSourceLocaleMessages('en'),
  // Traditional Chinese is pre-generated from the zh source (OpenCC),
  // keys it does not cover still fall back to `zh`.
  'zh-TW': buildAdditionalLocaleMessages('zh-TW'),
  ja: buildAdditionalLocaleMessages('ja'),
  ko: buildAdditionalLocaleMessages('ko'),
}

export const getLocalizedMessage = (
  locale: AdditionalLocale,
  namespace: MessageNamespace,
  key: string,
) => {
  return additionalLocaleSources[locale][`${namespace}.${key}`]
}
