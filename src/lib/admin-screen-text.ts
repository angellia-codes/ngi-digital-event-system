/** Admin console wording for screen settings and uploads (English, like the rest of the console). */
const SCREEN: Record<string, string> = {
  INVALID: 'Check the settings: “go to” needs a target that is not this screen or the draw; closing lines are up to 60 characters.',
  NOT_FOUND: 'That screen or segment no longer exists. Reload the page.',
  STALE: 'A newer video was uploaded meanwhile. Reload the page.',
  BAD_INPUT: 'Check the fields and try again.',
};

export const describeScreen = (status: string): string => SCREEN[status] ?? 'Could not save. Try again.';

/** "1:32" / "12:05" from seconds. */
export const formatDuration = (s: number | null): string =>
  s === null || !Number.isFinite(s) ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** "48.2 MB" */
export const formatMb = (bytes: number | null): string => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '');
