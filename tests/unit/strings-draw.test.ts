import { describe, expect, it } from 'vitest';
import { STRINGS, translate, type StringKey } from '@/lib/i18n/strings';

describe('draw strings', () => {
  it('match the Design Guide wording', () => {
    expect(translate('id', 'draw.landed_label')).toBe('NOMOR PEMENANG');
    expect(translate('id', 'draw.must_be_present')).toBe('PEMENANG HARUS HADIR · 60 DETIK');
    expect(translate('id', 'draw.progress', { n: 3, total: 12 })).toBe('UNDIAN 3 DARI 12');
    expect(translate('en', 'draw.progress', { n: 3, total: 12 })).toBe('DRAW 3 OF 12');
    expect(translate('id', 'draw.no_show')).toBe('TIDAK HADIR — UNDI ULANG');
    expect(translate('id', 'draw.confirm')).toBe('KONFIRMASI');
    expect(translate('id', 'draw.confirm_handover')).toBe('KONFIRMASI & SERAHKAN');
    expect(translate('id', 'draw.waiting_dots')).toBe('MENUNGGU PEMENANG...');
    expect(translate('id', 'stage.idle')).toBe('UNDIAN DIMULAI SEBENTAR LAGI');
    expect(translate('id', 'draw.next')).toBe('UNDIAN BERIKUTNYA');
  });

  it('carry no congratulations wording on any draw, verify or stage string (HR decision, 10 Oct)', () => {
    const keys = (Object.keys(STRINGS.id) as StringKey[]).filter((k) => /^(draw|verify|stage)\./.test(k));
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) {
      for (const lang of ['id', 'en'] as const) {
        expect(translate(lang, k), `${lang} ${k}`).not.toMatch(/selamat|congrat|kamu memenangkan|you won|hooray/i);
      }
    }
  });
});
