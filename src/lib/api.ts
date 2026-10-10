import { NextResponse } from 'next/server';
import type { ZodTypeAny, z } from 'zod';
import { RetryableError } from './db';

const NO_STORE = { 'Cache-Control': 'no-store' };

export function ok(status: string, data: unknown = null): NextResponse {
  return NextResponse.json({ ok: true, status, data }, { status: 200, headers: NO_STORE });
}

export function fail(http: number, status: string): NextResponse {
  return NextResponse.json({ ok: false, status }, { status: http, headers: NO_STORE });
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  return !!origin && origin === new URL(req.url).origin;
}

export async function readJson<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S> | null> {
  try {
    return schema.parse(await req.json());
  } catch {
    return null;
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

export function ipFromHeader(value: string | null): string {
  return value ? value.split(',')[0].trim() || 'unknown' : 'unknown';
}
export const clientIp = (req: Request): string => ipFromHeader(req.headers.get('x-forwarded-for'));

type Handler<C> = (req: Request, ctx?: C) => Promise<Response>;

/** Any failure becomes 500 RETRYABLE_ERROR. Retrying is always safe. */
export function guard<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (!(e instanceof RetryableError)) console.error('unhandled', e instanceof Error ? e.message : 'unknown');
      return fail(500, 'RETRYABLE_ERROR');
    }
  };
}
