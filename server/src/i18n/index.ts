import { LOCALES, type Locale } from '@fg/shared';
import de from './locales/de.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

type Messages = { [key: string]: string | Messages };
const catalogs: Record<Locale, Messages> = { de, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Translates a dotted key, replacing `{param}` placeholders. Falls back to German, then the key. */
export function t(locale: Locale, key: string, params: Record<string, string | number> = {}): string {
  const lookup = (messages: Messages): string | undefined => {
    let node: string | Messages | undefined = messages;
    for (const part of key.split('.')) {
      if (typeof node !== 'object') return undefined;
      node = node[part];
    }
    return typeof node === 'string' ? node : undefined;
  };
  const template = lookup(catalogs[locale]) ?? lookup(catalogs.de) ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

export { catalogs };
