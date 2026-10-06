import { tooManyMessage } from './too-many';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: { error?: string; code?: string; fields?: Record<string, string> } = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const form = init?.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(form ? {} : { 'content-type': 'application/json' }), ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as ApiError['body'];
  if (response.status === 429)
    throw new ApiError(429, tooManyMessage(body, response.headers.get('retry-after')), body);
  if (!response.ok) throw new ApiError(response.status, body.error ?? 'Erreur réseau', body);
  return body as T;
}
