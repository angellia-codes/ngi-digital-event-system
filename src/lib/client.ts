export type ApiResult<T = unknown> = { http: number; ok: boolean; status: string; data: T | null };

/** POST when `body` is given, otherwise GET. Never throws. */
export async function api<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; status?: string; data?: T } | null;
    return { http: res.status, ok: !!json?.ok, status: json?.status ?? 'RETRYABLE_ERROR', data: json?.data ?? null };
  } catch {
    return { http: 0, ok: false, status: 'RETRYABLE_ERROR', data: null };
  }
}
