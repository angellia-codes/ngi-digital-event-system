/** YYYY-MM-DD in Asia/Makassar (WITA) for an instant. */
export function witaDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

export type Countdown = { days: number; hours: number; mins: number; done: boolean };

/** Time left until `target` (ms). `now` should already include the server offset. Floors to whole minutes. */
export function countdownParts(target: number, now: number): Countdown {
  const left = target - now;
  if (left <= 0) return { days: 0, hours: 0, mins: 0, done: true };
  const mins = Math.floor(left / 60_000);
  return { days: Math.floor(mins / 1440), hours: Math.floor((mins % 1440) / 60), mins: mins % 60, done: false };
}
