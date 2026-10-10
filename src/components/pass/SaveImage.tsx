'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { padPrize } from './PrizeNumber';

async function render(name: string, outlet: string, n: number): Promise<Blob> {
  const css = getComputedStyle(document.body);
  const display = css.getPropertyValue('--nf-font-display') || 'Impact, sans-serif';
  const heading = css.getPropertyValue('--nf-font-heading') || 'Impact, sans-serif';
  const label = css.getPropertyValue('--nf-font-label') || 'sans-serif';
  await Promise.all([`150px ${display}`, `40px ${heading}`, `30px ${label}`].map((f) => document.fonts.load(f).catch(() => [])));
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1920; // 9:16
  const x = c.getContext('2d')!;
  x.fillStyle = '#0D0D0D'; x.fillRect(0, 0, 1080, 1920);
  x.textAlign = 'center';
  x.fillStyle = '#D4AF37'; x.font = `64px ${display}`; x.fillText('NOURISHFEST 2026', 540, 220);
  x.fillStyle = '#F5F5F0'; x.font = `34px ${label}`; x.fillText('DOOR PRIZE', 540, 860);
  x.fillStyle = '#FF1B6B'; x.font = `420px ${display}`; x.fillText(padPrize(n), 548, 1240); // hard pink shadow
  x.fillStyle = '#D4AF37'; x.fillText(padPrize(n), 540, 1232);
  x.fillStyle = '#F5F5F0'; x.font = `84px ${heading}`; x.fillText(name.toUpperCase().slice(0, 28), 540, 1480);
  x.fillStyle = '#D4AF37'; x.font = `44px ${label}`; x.fillText(outlet.toUpperCase().slice(0, 36), 540, 1560);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
}

export function SaveImage({ name, outlet, n }: { name: string; outlet: string; n: number }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const blob = await render(name, outlet, n);
      const file = new File([blob], `nourishfest-${padPrize(n)}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
    } catch { /* user cancelled the share sheet or canvas failed: nothing to do */ }
    setBusy(false);
  }
  return <button type="button" className="btn btn--outline" onClick={save} disabled={busy} aria-disabled={busy}>{t('pass.save')}</button>;
}
