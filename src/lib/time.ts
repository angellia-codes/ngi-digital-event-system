import type { Lang } from './i18n/strings';

const TZ = 'Asia/Makassar'; // WITA, UTC+8

export function formatTimeWita(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

export function formatDateLong(date: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(date));
}

/** Pass date line, Design Guide 9.1: "THU 10 DEC 2026" / "KAM 10 DES 2026". */
export function formatDateShort(date: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(date)).replace(/[.,]/g, '').toUpperCase();
}
