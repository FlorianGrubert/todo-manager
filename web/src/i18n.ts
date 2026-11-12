import { createI18n } from 'vue-i18n';
import { LOCALES, type Locale } from '@fg/shared';
import de from './locales/de.json';
import en from './locales/en.json';

export type MessageSchema = typeof de;

const STORAGE_KEY = 'fgtm.locale';

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  } catch {
    // storage unavailable – fall back to the browser language
  }
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'de',
  messages: { de, en },
});

export function applyLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

/** Translation key for an API error code (unknown codes map to `internal`). */
export function errorKey(err: unknown): string {
  const code = (err as { code?: string } | undefined)?.code;
  return code && code in de.errors ? `errors.${code}` : 'errors.internal';
}
