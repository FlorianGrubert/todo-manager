import type { z } from 'zod';
import { badRequest } from './errors.js';

/** Parses untrusted input with a zod schema; throws 400 on failure. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest();
  return result.data;
}
