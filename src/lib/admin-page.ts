import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { STATION_COOKIE, verifyStationToken } from './session';

/** For admin server components: returns the signed-in admin or sends the browser to the PIN screen. */
export async function requireAdminPage(): Promise<{ email: string }> {
  const s = await verifyStationToken((await cookies()).get(STATION_COOKIE)?.value).catch(() => null);
  if (s?.role !== 'admin') redirect('/station');
  return { email: 'admin' };
}
