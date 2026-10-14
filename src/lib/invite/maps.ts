const HOSTS = new Set(['www.google.com', 'google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl']);

/** Same rule as set_event_details in SQL: https + Google Maps host (goo.gl and google.com need /maps). */
export function isMapsUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname)) return false;
  if (u.hostname === 'www.google.com' || u.hostname === 'google.com' || u.hostname === 'goo.gl') {
    return u.pathname === '/maps' || u.pathname.startsWith('/maps/');
  }
  return true;
}
