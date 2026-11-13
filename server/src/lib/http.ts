import { z } from 'zod';

export const idParam = z.object({ id: z.string().min(1).max(64) });
export const optionalId = z.string().min(1).max(64).nullable();
export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Converts camelCase keys of a partial update into the given column names, skipping undefined. */
export function pickDefined(input: Record<string, unknown>, columns: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] !== undefined) out[column] = input[key];
  }
  return out;
}
