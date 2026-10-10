import type { ZodTypeAny, z } from 'zod';
import { fail, guard, readJson, sameOrigin } from './api';
import { getAdmin } from './admin-auth';
import { readStation, type Role } from './session';

export type Actor =
  | { type: 'station'; role: Role; label: string; v: number }
  | { type: 'admin'; email: string };
export const ADMIN_ID = 'admin';
export const actorId = (a: Actor): string => (a.type === 'station' ? a.role : a.email);
export const actorLabel = (a: Actor): string => (a.type === 'station' ? a.label : 'admin');

type Params = Record<string, string>;
type Ctx = { params?: Promise<Params> };
type Args<B> = { req: Request; actor: Actor; body: B; params: Params };

async function authStation(req: Request, roles: readonly Role[]): Promise<{ actor: Actor } | { res: Response }> {
  const s = await readStation(req);
  if (s?.role === 'admin') return { actor: { type: 'admin', email: ADMIN_ID } };
  if (s) {
    return roles.includes(s.role)
      ? { actor: { type: 'station', role: s.role, label: s.label, v: s.v } }
      : { res: fail(403, 'WRONG_ROLE') };
  }
  const admin = await getAdmin(req);
  return admin ? { actor: { type: 'admin', email: admin.email } } : { res: fail(401, 'NO_SESSION') };
}

async function authAdmin(req: Request): Promise<{ actor: Actor } | { res: Response }> {
  const admin = await getAdmin(req);
  return admin ? { actor: { type: 'admin', email: admin.email } } : { res: fail(401, 'NO_SESSION') };
}

export function stationPost<S extends ZodTypeAny>(roles: readonly Role[], schema: S, fn: (a: Args<z.infer<S>>) => Promise<Response>) {
  return guard(async (req: Request, ctx?: Ctx) => {
    if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
    const a = await authStation(req, roles);
    if ('res' in a) return a.res;
    const body = await readJson(req, schema);
    if (body === null) return fail(400, 'BAD_INPUT');
    return fn({ req, actor: a.actor, body, params: (await ctx?.params) ?? {} });
  });
}

export function stationGet(roles: readonly Role[], fn: (a: Omit<Args<null>, 'body'>) => Promise<Response>) {
  return guard(async (req: Request, ctx?: Ctx) => {
    const a = await authStation(req, roles);
    if ('res' in a) return a.res;
    return fn({ req, actor: a.actor, params: (await ctx?.params) ?? {} });
  });
}

export function adminPost<S extends ZodTypeAny>(schema: S, fn: (a: Args<z.infer<S>>) => Promise<Response>) {
  return guard(async (req: Request, ctx?: Ctx) => {
    if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
    const a = await authAdmin(req);
    if ('res' in a) return a.res;
    const body = await readJson(req, schema);
    if (body === null) return fail(400, 'BAD_INPUT');
    return fn({ req, actor: a.actor, body, params: (await ctx?.params) ?? {} });
  });
}

export function adminGet(fn: (a: Omit<Args<null>, 'body'>) => Promise<Response>) {
  return guard(async (req: Request, ctx?: Ctx) => {
    const a = await authAdmin(req);
    if ('res' in a) return a.res;
    return fn({ req, actor: a.actor, params: (await ctx?.params) ?? {} });
  });
}
