export type CalInput = {
  title: string; startMs: number; endMs: number; location: string; details: string; uid: string;
};

const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleCalendarUrl(i: CalInput): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: i.title, dates: `${utc(i.startMs)}/${utc(i.endMs)}`, location: i.location, details: i.details,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// RFC 5545 TEXT escaping: backslash, newline, comma, semicolon.
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

export function buildIcs(i: CalInput): string {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NourishFest//Invitation//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${i.uid}`, `DTSTAMP:${utc(Date.now())}`,
    `DTSTART:${utc(i.startMs)}`, `DTEND:${utc(i.endMs)}`,
    `SUMMARY:${esc(i.title)}`, `LOCATION:${esc(i.location)}`, `DESCRIPTION:${esc(i.details)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n') + '\r\n';
}
