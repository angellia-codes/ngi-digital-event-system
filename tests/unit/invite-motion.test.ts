import { describe, expect, it } from 'vitest';
import { INVITE_EN, INVITE_ID } from '@/lib/i18n/invite-strings';
import {
  BEAT_MS, BPM, DROP_BEATS, OPENING_BACKUP_MS, SETTLE_BEATS, STAGE_H, STAGE_W,
  musicDropDelay, splitLines, stageScale, tickVisible,
} from '@/lib/invite/motion';

describe('tempo', () => {
  it('is 105 BPM and the beat is 60000 / BPM rounded', () => {
    expect(BPM).toBe(105);
    expect(BEAT_MS).toBe(Math.round(60000 / BPM));
    expect(BEAT_MS).toBe(571);
  });
  it('drops the music on beat 2 and settles glass after 3 beats', () => {
    expect(DROP_BEATS).toBe(2);
    expect(SETTLE_BEATS).toBe(3);
    expect(OPENING_BACKUP_MS).toBe(10_000);
  });
});

describe('musicDropDelay', () => {
  it('waits until the click when the song is ready early', () => expect(musicDropDelay(1000, 2142)).toBe(1142));
  it('starts now when the song is ready late', () => expect(musicDropDelay(5000, 2142)).toBe(0));
  it('starts now exactly on the click', () => expect(musicDropDelay(2142, 2142)).toBe(0));
});

describe('stageScale', () => {
  it('is 1 on the design size', () => expect(stageScale(STAGE_W, STAGE_H)).toBe(1));
  it('fits the narrower side', () => {
    expect(stageScale(390, 844)).toBeCloseTo(390 / 360, 5);
    expect(stageScale(720, 640)).toBe(1);
  });
  it('falls back to 1 for an unmeasured box', () => {
    expect(stageScale(0, 640)).toBe(1);
    expect(stageScale(360, Number.NaN)).toBe(1);
  });
});

describe('tickVisible', () => {
  it('counts only visible time', () => {
    expect(tickVisible(0, 250, true)).toBe(250);
    expect(tickVisible(250, 250, false)).toBe(250);
  });
});

describe('splitLines', () => {
  it('splits the about copy into three lines in English', () => {
    expect(splitLines(INVITE_EN['invite.about'])).toEqual([
      'One night for all of us.',
      'Every outlet, one stage, one beat:',
      'rewinding to the 90s and celebrating a year of hard work with the Nourish family.',
    ]);
  });
  it('splits the about copy into three lines in Indonesian', () => {
    expect(splitLines(INVITE_ID['invite.about'])).toHaveLength(3);
  });
  it('keeps text without a break whole', () => expect(splitLines('Just one line')).toEqual(['Just one line']));
});
