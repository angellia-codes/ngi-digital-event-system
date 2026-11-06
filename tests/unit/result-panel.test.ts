import { describe, it, expect } from 'vitest';
import { panelFor } from '@/lib/result-panel';
import { STRINGS } from '@/lib/i18n/strings';

describe('panelFor', () => {
  it('maps check-in outcomes to the colours in the Design Guide', () => {
    expect(panelFor('checkin', 'CHECKED_IN')).toMatchObject({ tone: 'green', icon: 'check', titleKey: 'staff.success' });
    expect(panelFor('checkin', 'ALREADY_CHECKED_IN')).toMatchObject({ tone: 'pink', icon: 'alert', titleKey: 'staff.already' });
    expect(panelFor('checkin', 'WRONG_CODE_TYPE')).toMatchObject({ tone: 'gold', icon: 'swap', titleKey: 'staff.wrong_checkin' });
    expect(panelFor('checkin', 'INVALID')).toMatchObject({ tone: 'pink', icon: 'cross' });
  });
  it('maps merchandise outcomes', () => {
    expect(panelFor('merchandise', 'READY')).toMatchObject({ tone: 'neutral', titleKey: 'merch.ready' });
    expect(panelFor('merchandise', 'REDEEMED')).toMatchObject({ tone: 'green', titleKey: 'merch.recorded' });
    expect(panelFor('merchandise', 'ALREADY_REDEEMED')).toMatchObject({ tone: 'pink', titleKey: 'merch.claimed' });
    expect(panelFor('merchandise', 'NOT_CHECKED_IN')).toMatchObject({ tone: 'pink', titleKey: 'merch.not_checked_in' });
    expect(panelFor('merchandise', 'WRONG_CODE_TYPE')).toMatchObject({ tone: 'gold', titleKey: 'staff.wrong_merch' });
  });
  it('maps bar outcomes', () => {
    expect(panelFor('bar', 'READY')).toMatchObject({ tone: 'neutral', titleKey: 'bev.ready' });
    expect(panelFor('bar', 'REDEEMED')).toMatchObject({ tone: 'green', icon: 'check', titleKey: 'bev.recorded' });
    expect(panelFor('bar', 'ALREADY_REDEEMED')).toMatchObject({ tone: 'pink', titleKey: 'bev.claimed' });
    expect(panelFor('bar', 'NOT_CHECKED_IN')).toMatchObject({ tone: 'pink', titleKey: 'merch.not_checked_in' });
    expect(panelFor('bar', 'NO_CHOICE')).toMatchObject({ tone: 'gold', titleKey: 'bev.no_choice' });
    expect(panelFor('bar', 'WRONG_CODE_TYPE')).toMatchObject({ tone: 'gold', icon: 'swap', titleKey: 'bev.wrong_code' });
    expect(panelFor('bar', 'INVALID')).toMatchObject({ tone: 'pink', titleKey: 'staff.invalid' });
    expect(panelFor('bar', 'NOT_ELIGIBLE')).toMatchObject({ tone: 'pink', titleKey: 'staff.not_eligible' });
    expect(panelFor('bar', 'RETRYABLE_ERROR')).toMatchObject({ tone: 'gold', icon: 'refresh' });
  });
  it('treats unknown statuses as a retryable error', () => {
    expect(panelFor('checkin', 'SOMETHING_NEW')).toMatchObject({ tone: 'gold', icon: 'refresh', titleKey: 'staff.retry' });
  });
  it('only uses title keys that exist', () => {
    for (const ctx of ['checkin', 'merchandise', 'bar'] as const) {
      for (const s of ['CHECKED_IN', 'ALREADY_CHECKED_IN', 'READY', 'REDEEMED', 'ALREADY_REDEEMED', 'NOT_CHECKED_IN', 'INVALID', 'WRONG_CODE_TYPE', 'NOT_ELIGIBLE', 'RETRYABLE_ERROR', 'NO_CHOICE']) {
        expect(STRINGS.id[panelFor(ctx, s).titleKey]).toBeTruthy();
      }
    }
  });
});
