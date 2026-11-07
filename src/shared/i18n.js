// Interface language. English is the default. Every extension context (popup, settings
// page, the panel on the page, engine, service worker) keeps its own current language,
// set from settings.uiLanguage. The texts are in ./locales, one file per language, each
// with exactly the keys of en.js.

import { languageByCode, AUTO_LANGUAGE } from './languages.js';
import en from './locales/en.js';
import tr from './locales/tr.js';
import de from './locales/de.js';
import es from './locales/es.js';
import zh from './locales/zh.js';

// name: how the language calls itself, for the language switch.
export const UI_LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en-US' },
  { code: 'tr', name: 'Türkçe', locale: 'tr-TR' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'zh', name: '中文', locale: 'zh-CN' },
];

const STRINGS = { en, tr, de, es, zh };

let current = 'en';

export function setLanguage(code) {
  current = STRINGS[code] ? code : 'en';
  return current;
}

export function getLanguage() {
  return current;
}

export function locale() {
  return UI_LANGUAGES.find((l) => l.code === current)?.locale || 'en-US';
}

export function t(key, params = {}) {
  const text = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// Names of the call languages in the interface language, from the browser's own data.
const displayNames = new Map();
export function languageLabel(code) {
  if (code === AUTO_LANGUAGE) return t('lang.auto');
  try {
    if (!displayNames.has(current)) displayNames.set(current, new Intl.DisplayNames([locale()], { type: 'language' }));
    const name = displayNames.get(current).of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(locale()) + name.slice(1);
  } catch {
    // an engine without Intl.DisplayNames
  }
  return languageByCode(code).english;
}

export function joinNames(names) {
  return names.join(t('common.and'));
}

// Fills elements marked with data-i18n (text), data-i18n-placeholder and data-i18n-title.
export function applyI18n(root = document) {
  if (root.documentElement) root.documentElement.lang = current;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute('aria-label', el.title);
  }
}

export const STRINGS_FOR_TESTS = STRINGS;
