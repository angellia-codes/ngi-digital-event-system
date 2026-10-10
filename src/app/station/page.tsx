'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import '@/styles/station.css';

const HOME: Record<string, string | undefined> = {
  checkin: '/station/check-in',
  merchandise: '/station/merchandise',
  // draw and prizes screens are added in Plan 2
};

export default function StationLogin() {
  const router = useRouter();
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'pin' | 'label'>('pin');
  const [role, setRole] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const r = await api<{ role: string; labels: string[] }>('/api/station/login', { pin });
    setBusy(false);
    if (r.http === 429) return setMessage(t('login.locked'));
    if (r.status === 'INVALID') { setPin(''); return setMessage(t('login.invalid')); }
    if (!r.ok || !r.data) return setMessage(t('common.retry_hint'));
    if (!HOME[r.data.role]) return setMessage(t('login.coming_soon'));
    setRole(r.data.role);
    setLabels(r.data.labels);
    setStep('label');
  }

  async function submitLabel() {
    setBusy(true);
    const r = await api('/api/station/select-label', { label });
    setBusy(false);
    if (r.ok) router.replace(HOME[role]!);
    else setMessage(t('common.retry_hint'));
  }

  return (
    <div className="station">
      <header className="station__bar"><span className="station__chip">NOURISHFEST 2026</span><LangToggle /></header>
      <div className="login">
        <h1>{t('login.title')}</h1>
        {step === 'pin' ? (
          <form onSubmit={submitPin} className="login">
            <input className="field" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" autoFocus
              aria-label={t('login.pin')} placeholder="••••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            <button className="btn--staff" type="submit" disabled={busy || pin.length !== 6}>{t('login.submit')}</button>
          </form>
        ) : (
          <>
            <p>{t('login.pick_station')}</p>
            <div className="choices">
              {labels.map((l) => (
                <button key={l} type="button" className="choice" aria-pressed={label === l} onClick={() => setLabel(l)}>{l}</button>
              ))}
            </div>
            <button className="btn--staff" type="button" disabled={busy || !label} onClick={submitLabel}>{t('login.continue')}</button>
          </>
        )}
        {message && <p role="alert" className="error">{message}</p>}
      </div>
    </div>
  );
}
