import type { ApiError } from '@prioritize/shared';

export class ApiFail extends Error {
  constructor(public status: number, public body: ApiError) {
    super(body.error);
  }
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.body.fields ?? []).map((f) => [f.field, f.message]));
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiFail(res.status, data ?? { error: res.statusText });
  return data as T;
}
