import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('translations', () => {
  it('German and English contain the same keys', () => {
    expect(keys(en).sort()).toEqual(keys(de).sort());
  });

  it('contain no empty texts', () => {
    const empty = (obj: object): boolean =>
      Object.values(obj).some((v) => (typeof v === 'object' && v !== null ? empty(v as object) : !String(v).trim()));
    expect(empty(de)).toBe(false);
    expect(empty(en)).toBe(false);
  });
});
