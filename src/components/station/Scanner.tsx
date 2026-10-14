'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';

declare global { interface Window { __nfInjectCode?: (text: string) => void } }

/** Camera strip. The camera starts only after an explanatory screen and a tap (also required by iOS Safari). */
export function Scanner({ onCode, paused, problem, onManual }: { onCode: (text: string) => void; paused: boolean; problem?: boolean; onManual?: () => void }) {
  const { t } = useI18n();
  const [started, setStarted] = useState(false);
  const [denied, setDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const handler = useRef(onCode);
  const isPaused = useRef(paused);
  const last = useRef({ text: '', at: 0 });
  handler.current = onCode;
  isPaused.current = paused;

  const deliver = (text: string) => {
    const now = Date.now();
    if (isPaused.current) return;
    if (text === last.current.text && now - last.current.at < 2000) return; // ignore the same code for 2 seconds
    last.current = { text, at: now };
    handler.current(text);
  };

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E === '1') window.__nfInjectCode = deliver;
    return () => { delete window.__nfInjectCode; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    let scanner: import('html5-qrcode').Html5Qrcode | null = null;
    (async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled) return;
      scanner = new Html5Qrcode('nf-scanner');
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.8); return { width: s, height: s }; } },
          (text) => deliver(text),
          () => {},
        );
      } catch {
        if (!cancelled) setDenied(true);
      }
    })();
    return () => {
      cancelled = true;
      const s = scanner;
      if (s?.isScanning) s.stop().then(() => s.clear()).catch(() => {});
    };
  }, [started, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!started || denied) {
    return (
      <div className="scanner">
        <div className="scanner__gate">
          {denied ? (
            <>
              <p role="alert">{t('staff.camera_denied')}</p>
              <p className="scanner__help">{t('staff.camera_help')}</p>
              <div className="scanner__actions">
                <button type="button" className="btn--staff" onClick={() => { setDenied(false); setAttempt((a) => a + 1); }}>{t('staff.camera_retry')}</button>
                {onManual && <button type="button" className="btn--staff btn--staff-dark" onClick={onManual}>{t('staff.to_manual')}</button>}
              </div>
            </>
          ) : (
            <>
              <p><b>{t('staff.camera_title')}</b></p>
              <p>{t('staff.camera_body')}</p>
              <button type="button" className="btn--staff" onClick={() => setStarted(true)}>{t('staff.camera_start')}</button>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="scanner">
      <div id="nf-scanner" className="scanner__video" />
      <div className={problem ? 'brackets brackets--problem' : 'brackets'} aria-hidden="true"><i /><i /><i /><i /></div>
      <p className="scanner__hint">{t('staff.camera_hint')}</p>
    </div>
  );
}
