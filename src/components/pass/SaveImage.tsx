'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { PassData } from '@/lib/pass';
import { payloadFor } from '@/lib/qr';
import { qrPath } from '@/lib/qr-svg';
import { formatDateShort, formatTimeWita } from '@/lib/time';
import { padPrize } from './PrizeNumber';

type T = ReturnType<typeof useI18n>['t'];
type Lang = ReturnType<typeof useI18n>['lang'];
const W = 1080, H = 1920; // 9:16, fits a phone gallery
const C = { black: '#0D0D0D', card: '#141414', gold: '#D4AF37', pink: '#FF1B6B', text: '#F5F5F0', soft: '#BDBDB6', dash: '#3A3A36', white: '#FFFFFF' };

/** Sets the largest font size (down to `min`) at which `text` fits `max` px; below that, cuts it with an ellipsis. */
function fit(x: CanvasRenderingContext2D, text: string, family: string, start: number, min: number, max: number): string {
  for (let s = start; s >= min; s -= 2) {
    x.font = `${s}px ${family}`;
    if (x.measureText(text).width <= max) return text;
  }
  let cut = text;
  while (cut.length > 1 && x.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function pill(x: CanvasRenderingContext2D, cx: number, y: number, text: string, family: string) {
  x.font = `600 34px ${family}`;
  const w = x.measureText(text).width + 64;
  x.fillStyle = C.gold;
  x.beginPath(); x.roundRect(cx - w / 2, y - 44, w, 64, 32); x.fill();
  x.fillStyle = C.black; x.fillText(text, cx, y);
}

async function render(kind: 'ticket' | 'number', d: PassData, t: T, lang: Lang): Promise<Blob> {
  const css = getComputedStyle(document.body);
  const font = (v: string, fb: string) => css.getPropertyValue(v).trim() || fb;
  const display = font('--nf-font-display', 'Impact, sans-serif');
  const heading = font('--nf-font-heading', 'Impact, sans-serif');
  const label = font('--nf-font-label', 'sans-serif');
  const body = font('--nf-font-body', 'sans-serif');
  await Promise.all([`64px ${display}`, `84px ${heading}`, `600 34px ${label}`, `34px ${body}`].map((f) => document.fonts.load(f).catch(() => [])));

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = C.black; x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  // Wordmark with the hard pink offset, as on the pass.
  x.font = `72px ${display}`;
  x.fillStyle = C.pink; x.fillText('NOURISHFEST 2026', W / 2 + 4, 204);
  x.fillStyle = C.gold; x.fillText('NOURISHFEST 2026', W / 2, 200);
  const when = [formatDateShort(d.event.date, lang), d.event.doors_at ? t('invite.doors', { doors: formatTimeWita(d.event.doors_at) }) : null]
    .filter(Boolean).join(' · ');
  x.fillStyle = C.gold; x.font = `600 34px ${label}`; x.fillText(when, W / 2, 268);
  const name = d.guest.full_name.toUpperCase();
  const meta = [d.guest.outlet, d.guest.department].filter(Boolean).join(' · ').toUpperCase();

  if (kind === 'number') {
    x.fillStyle = C.text; x.font = `600 40px ${label}`; x.fillText(t('pass.prize_number'), W / 2, 820);
    const n = padPrize(d.prize_number ?? 0);
    x.font = `420px ${display}`;
    x.fillStyle = C.pink; x.fillText(n, W / 2 + 8, 1220);
    x.fillStyle = C.gold; x.fillText(n, W / 2, 1212);
    x.fillStyle = C.text; x.fillText(fit(x, name, heading, 84, 52, 940), W / 2, 1460);
    x.fillStyle = C.gold; x.fillText(fit(x, meta, label, 44, 30, 940), W / 2, 1540);
  } else {
    // The ticket: gold border, name block, perforation, check-in QR on its white tile.
    x.fillStyle = C.card; x.strokeStyle = C.gold; x.lineWidth = 12;
    x.beginPath(); x.roundRect(84, 340, W - 168, 1460, 40); x.fill(); x.stroke();
    x.fillStyle = C.soft; x.font = `600 32px ${label}`; x.fillText(t('pass.greeting'), W / 2, 430);
    x.fillStyle = C.text; x.fillText(fit(x, name, heading, 96, 56, 840), W / 2, 530);
    x.fillStyle = C.gold; x.fillText(fit(x, meta, label, 38, 28, 840), W / 2, 594);
    x.strokeStyle = C.dash; x.lineWidth = 4; x.setLineDash([18, 14]);
    x.beginPath(); x.moveTo(96, 650); x.lineTo(W - 96, 650); x.stroke(); x.setLineDash([]);
    pill(x, W / 2, 748, t('pass.checkin_label'), label);
    const { size, d: path } = qrPath(payloadFor('checkin', d.invite_token));
    const ppm = Math.floor(720 / size); // whole pixels per module keep the code crisp
    const q = size * ppm, qx = Math.round((W - q) / 2), qy = 800;
    x.fillStyle = C.gold; x.beginPath(); x.roundRect(qx - 20, qy - 20, q + 40, q + 40, 36); x.fill();
    x.fillStyle = C.white; x.fillRect(qx, qy, q, q);
    x.save(); x.translate(qx, qy); x.scale(ppm, ppm); x.fillStyle = '#000000'; x.fill(new Path2D(path)); x.restore();
    x.fillStyle = C.text; x.font = `34px ${body}`; x.fillText(t('pass.show_qr'), W / 2, qy + q + 100);
    if (d.event.venue) { x.fillStyle = C.soft; x.fillText(fit(x, d.event.venue, body, 34, 26, 840), W / 2, qy + q + 156); }
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
}

export function SaveImage({ kind, data }: { kind: 'ticket' | 'number'; data: PassData }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const ready = useRef<{ key: string; blob: Blob } | null>(null);
  const key = `${kind}|${lang}|${data.guest.full_name}|${data.prize_number}|${data.event.doors_at}|${data.event.venue}`;
  const make = useCallback(() => render(kind, data, t, lang), [kind, data, t, lang]);
  const makeRef = useRef(make);
  makeRef.current = make;

  // Prepare the image while idle, so the share sheet opens inside the tap (iOS refuses a share after a slow await).
  useEffect(() => {
    let off = false;
    const go = () => { makeRef.current().then((blob) => { if (!off) ready.current = { key, blob }; }).catch(() => {}); };
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const id = ric ? ric(go) : window.setTimeout(go, 1200);
    return () => { off = true; if (!ric) window.clearTimeout(id); };
  }, [key]); // only what is drawn; a poll that returns the same data must not redraw

  async function save() {
    setState('busy');
    try {
      const blob = ready.current?.key === key ? ready.current.blob : await make();
      const name = kind === 'ticket' ? 'nourishfest-2026-ticket.png' : `nourishfest-2026-${padPrize(data.prize_number ?? 0)}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file] }); setState('idle'); return; } catch (e) {
          if ((e as Error).name === 'AbortError') { setState('idle'); return; } // the guest closed the share sheet
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="save">
      <button type="button" className="btn btn--outline" onClick={save} disabled={state === 'busy'} aria-disabled={state === 'busy'}>
        {state === 'busy' ? t('pass.saving') : t(kind === 'ticket' ? 'pass.save_ticket' : 'pass.save')}
      </button>
      {state === 'error' && <p className="caption caption--warn" role="alert">{t('pass.save_failed')}</p>}
    </div>
  );
}
