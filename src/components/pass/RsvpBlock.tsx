'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';

export function RsvpBlock({ token, status, onChange }: { token: string; status: 'pending' | 'yes' | 'no'; onChange: (s: 'yes' | 'no') => void }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const answered = status !== 'pending' && !editing;

  async function send(s: 'yes' | 'no') {
    setBusy(true);
    setError(false);
    const r = await api(`/api/pass/${token}/rsvp`, { status: s });
    setBusy(false);
    if (r.ok && r.status === 'OK') { onChange(s); setEditing(false); } else setError(true);
  }

  return (
    <section className="rsvp" aria-live="polite">
      <span className="label">{t('rsvp.title')}</span>
      {answered ? (
        <>
          <p className="rsvp__thanks">{t(status === 'yes' ? 'rsvp.thanks_yes' : 'rsvp.thanks_no')}</p>
          <button type="button" className="link" onClick={() => setEditing(true)}>{t('rsvp.change')}</button>
        </>
      ) : (
        <div className="rsvp__buttons">
          <button type="button" className="btn btn--primary" disabled={busy} aria-disabled={busy} onClick={() => send('yes')}>{t('rsvp.yes')}</button>
          <button type="button" className="btn btn--secondary" disabled={busy} aria-disabled={busy} onClick={() => send('no')}>{t('rsvp.no')}</button>
        </div>
      )}
      {error && <p className="error" role="alert">{t('rsvp.error')}</p>}
    </section>
  );
}
