/** Converts DB integer/boolean flags (SQLite returns 0/1) to boolean. */
export const toBool = (v: unknown): boolean => v === true || v === 1 || v === '1';
export const fromBool = (v: boolean): 0 | 1 => (v ? 1 : 0);
