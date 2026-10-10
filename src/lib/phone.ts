export type PhoneResult = { ok: true; value: string | null } | { ok: false };

/** Normalises Indonesian numbers to +62…; blank means "no phone". */
export function normalisePhone(raw: string | null | undefined): PhoneResult {
  const s = (raw ?? '').trim();
  if (s === '') return { ok: true, value: null };
  let d = s.replace(/[^\d+]/g, '');
  const plus = d.startsWith('+');
  d = d.replace(/\+/g, '');
  if (d.startsWith('62')) {
    // already international
  } else if (d.startsWith('0')) {
    d = '62' + d.slice(1);
  } else if (d.startsWith('8') && !plus) {
    d = '62' + d;
  }
  const out = '+' + d;
  return /^\+62\d{8,12}$/.test(out) ? { ok: true, value: out } : { ok: false };
}
