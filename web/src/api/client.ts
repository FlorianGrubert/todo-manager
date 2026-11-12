/** Error returned by the API (`{ error: code }`) or a network failure (`network`). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

let csrfToken: string | undefined;
let reachabilityListener: ((reachable: boolean) => void) | undefined;

/** Called with `false` when the server cannot be reached and `true` on the next successful response. */
export function onReachability(listener: (reachable: boolean) => void): void {
  reachabilityListener = listener;
}

export function setCsrfToken(token: string | undefined): void {
  csrfToken = token;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function api<T = unknown>(
  method: Method,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...extraHeaders };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    reachabilityListener?.(false);
    throw new ApiError(0, 'network');
  }
  // A proxy/service worker answering 502–504 also means "server not reachable".
  if (res.status >= 502 && res.status <= 504) {
    reachabilityListener?.(false);
    throw new ApiError(0, 'network');
  }
  reachabilityListener?.(true);
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'internal');
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body: unknown = {}) => api<T>('POST', path, body);
export const patch = <T>(path: string, body: unknown = {}) => api<T>('PATCH', path, body);
