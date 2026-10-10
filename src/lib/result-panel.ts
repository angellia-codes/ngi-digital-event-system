import type { StringKey } from './i18n/strings';

export type Context = 'checkin' | 'merchandise';
export type Tone = 'green' | 'pink' | 'gold' | 'neutral';
export type Icon = 'check' | 'alert' | 'cross' | 'swap' | 'refresh' | 'none';
export type Panel = { tone: Tone; icon: Icon; titleKey: StringKey; vibrate: number[] };

const SHORT = [80];
const DOUBLE = [80, 60, 80];
const p = (tone: Tone, icon: Icon, titleKey: StringKey, vibrate: number[]): Panel => ({ tone, icon, titleKey, vibrate });

const RETRY = p('gold', 'refresh', 'staff.retry', []);
const COMMON: Record<string, Panel> = {
  INVALID: p('pink', 'cross', 'staff.invalid', DOUBLE),
  NOT_ELIGIBLE: p('pink', 'cross', 'staff.not_eligible', DOUBLE),
  RETRYABLE_ERROR: RETRY,
};

const TABLE: Record<Context, Record<string, Panel>> = {
  checkin: {
    ...COMMON,
    CHECKED_IN: p('green', 'check', 'staff.success', SHORT),
    ALREADY_CHECKED_IN: p('pink', 'alert', 'staff.already', DOUBLE),
    WRONG_CODE_TYPE: p('gold', 'swap', 'staff.wrong_checkin', DOUBLE),
  },
  merchandise: {
    ...COMMON,
    READY: p('neutral', 'none', 'merch.ready', []),
    REDEEMED: p('green', 'check', 'merch.recorded', SHORT),
    ALREADY_REDEEMED: p('pink', 'alert', 'merch.claimed', DOUBLE),
    NOT_CHECKED_IN: p('pink', 'alert', 'merch.not_checked_in', DOUBLE),
    WRONG_CODE_TYPE: p('gold', 'swap', 'staff.wrong_merch', DOUBLE),
  },
};

export function panelFor(context: Context, status: string): Panel {
  return TABLE[context][status] ?? RETRY;
}
