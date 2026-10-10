import { describe, expect, it } from 'vitest';
import { auditSummary, describePrize, describeVoid, drawStatus, formatStampWita, percent, stageLinkText } from '@/lib/admin-draw-text';

describe('messages', () => {
  it('explain every prize refusal in words', () => {
    expect(describePrize('NAME_IN_USE')).toBe('Another prize already has that name.');
    expect(describePrize('QUANTITY_TOO_LOW')).toBe('The quantity cannot be lower than the slots already drawn.');
    expect(describePrize('LOCKED_BY_DRAWS')).toBe('Batch mode cannot be changed once this prize has been drawn.');
    expect(describePrize('HAS_DRAWS')).toBe('A prize that has been drawn cannot be deleted.');
    expect(describePrize('BAD_INPUT')).toBe(describePrize('INVALID'));
    expect(describePrize('SOMETHING_NEW')).toBe('Could not save. Try again.');
  });
  it('explain every void refusal', () => {
    expect(describeVoid('REASON_REQUIRED')).toBe('Give a reason of at least 5 characters.');
    expect(describeVoid('NOT_VOIDABLE')).toBe('That draw is already void.');
    expect(describeVoid('SOMETHING_NEW')).toBe('Could not void. Refresh and try again.');
  });
});

describe('drawStatus', () => {
  it('names and colours each draw status', () => {
    expect(drawStatus('drawn')).toEqual({ label: 'waiting for MC', tone: 'gold' });
    expect(drawStatus('confirmed')).toEqual({ label: 'confirmed', tone: 'green' });
    expect(drawStatus('void_no_show')).toEqual({ label: 'not here', tone: 'pink' });
    expect(drawStatus('void_admin')).toEqual({ label: 'voided by admin', tone: 'pink' });
    expect(drawStatus('odd')).toEqual({ label: 'odd', tone: 'plain' });
  });
});

describe('stageLinkText', () => {
  it('describes the projector connection from the heartbeat age', () => {
    expect(stageLinkText(null)).toBe('Never connected');
    expect(stageLinkText(3.2)).toBe('Connected, seen 3 s ago');
    expect(stageLinkText(14.9)).toBe('Connected, seen 15 s ago');
    expect(stageLinkText(15)).toBe('Not seen for 15 s');
    expect(stageLinkText(42)).toBe('Not seen for 42 s');
    expect(stageLinkText(300)).toBe('Not seen for 5 min');
  });
});

describe('formatting', () => {
  it('prints times in WITA with the date', () => {
    expect(formatStampWita('2026-12-10T09:42:05Z')).toBe('2026-12-10 17:42:05');
    expect(formatStampWita(null)).toBe('');
  });
  it('summarises audit details on one short line', () => {
    expect(auditSummary({ reason: 'wrong person', slot: 2 })).toBe('reason: wrong person · slot: 2');
    expect(auditSummary({ fields: ['name', 'tier'] })).toBe('fields: ["name","tier"]');
    expect(auditSummary(null)).toBe('');
    expect(auditSummary({ note: 'x'.repeat(300) })).toHaveLength(140);
    expect(auditSummary({ note: 'x'.repeat(300) }).endsWith('…')).toBe(true);
  });
  it('rounds percentages and survives an empty outlet', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(3, 3)).toBe(100);
    expect(percent(0, 0)).toBe(0);
  });
});
