export type StartInput = { checkedIn: boolean; todayWita: string; eventDate: string; seen: boolean; storageOk: boolean };

/** Decide whether the pass page opens on the invitation or straight on the pass. Dates are YYYY-MM-DD. */
export function decideStart(i: StartInput): 'pass' | 'invitation' {
  if (i.checkedIn) return 'pass';
  if (i.todayWita >= i.eventDate) return 'pass';
  if (i.storageOk && i.seen) return 'pass';
  return 'invitation';
}

const key = (token: string) => `nf_invite_seen_${token.slice(0, 8)}`;

export function readSeen(token: string): { seen: boolean; storageOk: boolean } {
  try { return { seen: localStorage.getItem(key(token)) === '1', storageOk: true }; } catch { return { seen: false, storageOk: false }; }
}
export function markSeen(token: string): void {
  try { localStorage.setItem(key(token), '1'); } catch { /* blocked storage: invitation just plays again */ }
}
