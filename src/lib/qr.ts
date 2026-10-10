export const PREFIX = { checkin: 'NF:CI:', merch: 'NF:MR:' } as const;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export type ParsedCode = { kind: 'checkin' | 'merch'; token: string } | { kind: 'unknown' };

export const isToken = (s: string): boolean => TOKEN.test(s);

export function parseCode(raw: string): ParsedCode {
  const s = raw.trim();
  for (const kind of ['checkin', 'merch'] as const) {
    const prefix = PREFIX[kind];
    if (s.startsWith(prefix)) {
      const token = s.slice(prefix.length);
      return isToken(token) ? { kind, token } : { kind: 'unknown' };
    }
  }
  return { kind: 'unknown' };
}

export const payloadFor = (kind: 'checkin' | 'merch', token: string): string => PREFIX[kind] + token;
