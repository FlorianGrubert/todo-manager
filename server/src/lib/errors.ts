import type { ErrorCode } from '@fg/shared';

/** Error that is sent to the client as `{ error: code }` with the given HTTP status. */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
  ) {
    super(code);
  }
}

export const notFound = () => new ApiError(404, 'not_found');
export const forbidden = () => new ApiError(403, 'forbidden');
export const badRequest = () => new ApiError(400, 'bad_request');
export const conflict = (code: ErrorCode = 'conflict') => new ApiError(409, code);
