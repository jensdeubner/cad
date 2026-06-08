import { de } from './de';
import { en } from './en';
import { applyDomTranslations } from './dom';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LOCALES, type Locale, type Messages } from './types';

const catalogs: Record<Locale, Messages> = { de, en };

let locale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

function detectLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === 'de' || stored === 'en') return stored;
  const nav = navigator.language.toLowerCase();
  return nav.startsWith('de') ? 'de' : 'en';
}

/** Replace `{{key}}` placeholders in translated strings. */
export function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? ''));
}

export function t(key: string, params?: Record<string, string | number>): string {
  const msg = catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
  return interpolate(msg, params);
}

export function getLocale(): Locale {
  return locale;
}

export function getLocales(): Locale[] {
  return LOCALES;
}

export function localeLabel(loc: Locale): string {
  return loc === 'de' ? 'Deutsch' : 'English';
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyLocaleChange() {
  for (const fn of listeners) fn();
}

export function setLocale(next: Locale) {
  if (!LOCALES.includes(next) || next === locale) return;
  locale = next;
  localStorage.setItem(LOCALE_STORAGE_KEY, next);
  document.documentElement.lang = next;
  applyDomTranslations();
  notifyLocaleChange();
}

export function initI18n() {
  locale = detectLocale();
  document.documentElement.lang = locale;
  applyDomTranslations();
}

export function refreshDynamicI18n(opts?: { transformLocal?: boolean }) {
  applyDomTranslations(opts);
}