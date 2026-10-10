import { readStation } from './session';

export async function getAdmin(req: Request): Promise<{ email: string } | null> {
  const s = await readStation(req);
  return s?.role === 'admin' ? { email: 'admin' } : null;
}
