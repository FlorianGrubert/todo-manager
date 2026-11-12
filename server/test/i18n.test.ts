import { describe, expect, it } from 'vitest';
import { catalogs, t } from '../src/i18n/index.js';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('server translations', () => {
  it('German and English contain the same keys', () => {
    expect(keys(catalogs.en).sort()).toEqual(keys(catalogs.de).sort());
  });

  it('interpolates parameters', () => {
    expect(t('en', 'mail.greeting', { name: 'Ada' })).toBe('Hello Ada,');
    expect(t('de', 'mail.greeting', { name: 'Ada' })).toBe('Hallo Ada,');
  });
});
