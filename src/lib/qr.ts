export const PREFIX = { checkin: 'NF:CI:', merch: 'NF:MR:', beverage: 'NF:BV:' } as const;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export type CodeKind = keyof typeof PREFIX;
export type ParsedCode = { kind: CodeKind; token: string } | { kind: 'unknown' };

export const isToken = (s: string): boolean => TOKEN.test(s);

export function parseCode(raw: string): ParsedCode {
  const s = raw.trim();
  for (const kind of Object.keys(PREFIX) as CodeKind[]) {
    const prefix = PREFIX[kind];
    if (s.startsWith(prefix)) {
      const token = s.slice(prefix.length);
      return isToken(token) ? { kind, token } : { kind: 'unknown' };
    }
  }
  return { kind: 'unknown' };
}

export const payloadFor = (kind: CodeKind, token: string): string => PREFIX[kind] + token;
