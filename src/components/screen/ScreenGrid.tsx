'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { SCREEN_GROUPS, SCREENS, screenDef, screenLabel, switchConfirm, type ScreenKey, type ScreenState } from '@/lib/screens';

const GROUP_LABEL: Record<string, StringKey> = {
  ambient: 'screen.group_ambient', video: 'screen.group_video', live: 'screen.group_live', card: 'screen.group_card',
};

/**
 * Up next + the 12 buttons. Two steps: tap selects, TAYANGKAN puts it live. Blackout is one tap.
 * Every switch carries the screen_rev this panel showed; CHANGED means someone else moved the screen first.
 */
export function ScreenGrid({ state, onState }: { state: ScreenState; onState: (s: ScreenState) => void }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<ScreenKey | null>(null);
  const [confirm, setConfirm] = useState<{ key: ScreenKey; kind: 'replay' | 'leave_draw' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const hasFile = (k: ScreenKey) => {
    const kind = screenDef(k).kind;
    return (kind !== 'loop' && kind !== 'once') || !!state.screens.find((s) => s.key === k)?.has_video;
  };
  const soundOff = state.cache.sound_on === false;

  async function send(key: ScreenKey) {
    setBusy(true);
    setMsg('');
    const r = await api<{ state?: ScreenState }>('/api/station/screen/set', { key, from_screen_rev: state.screen_rev });
    setBusy(false);
    setConfirm(null);
    if (r.data?.state) onState(r.data.state);
    if (r.status === 'OK') setSelected(null);
    else setMsg(t(r.status === 'CHANGED' ? 'screen.changed' : r.status === 'NO_VIDEO' ? 'screen.no_video' : 'screen.error'));
  }

  function go(key: ScreenKey) {
    const ask = switchConfirm(state, key);
    if (ask) setConfirm({ key, kind: ask });
    else send(key);
  }

  const up = state.up_next;
  return (
    <div className="scr-body">
      {up && up.screen !== state.screen.key && (
        <section className="scr-next">
          <h2>{t('screen.up_next')}</h2>
          <div className="scr-next__line">{up.title} → <b>{t(screenLabel(up.screen))}</b>{screenDef(up.screen).audio && ' 🔊'}</div>
          <button type="button" className="btn--staff" disabled={busy || !hasFile(up.screen)} onClick={() => go(up.screen)}>{t('screen.go')}</button>
        </section>
      )}

      {SCREEN_GROUPS.map((g) => (
        <section key={g} className="scr-group">
          <h2>{t(GROUP_LABEL[g])}</h2>
          <div className="scr-grid">
            {SCREENS.filter((s) => s.group === g).map((s) => {
              const live = state.screen.key === s.key;
              const ready = hasFile(s.key);
              return (
                <button key={s.key} type="button" disabled={!ready || busy}
                  className={['scr-btn', live && 'scr-btn--live', selected === s.key && 'scr-btn--selected', s.key === 'blackout' && 'scr-btn--black'].filter(Boolean).join(' ')}
                  aria-pressed={selected === s.key}
                  onClick={() => (s.key === 'blackout' ? go('blackout') : setSelected(s.key))}>
                  <span>{t(screenLabel(s.key))}{s.audio && ' 🔊'}</span>
                  {!ready && <small>{t('screen.no_video')}</small>}
                  {live && <small>● {t('screen.on_air')}</small>}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className="scr-go">
        {confirm ? (
          <div className="mc-confirm">
            <p>{t(confirm.kind === 'replay' ? 'screen.replay_confirm' : 'screen.leave_draw_confirm')}</p>
            <div className="scr-go__row">
              <button type="button" className="btn--staff" disabled={busy} onClick={() => send(confirm.key)}>{t('screen.yes')}</button>
              <button type="button" className="btn--staff btn--staff-dark" onClick={() => setConfirm(null)}>{t('screen.cancel')}</button>
            </div>
          </div>
        ) : (
          <>
            {selected && screenDef(selected).audio && soundOff && <p className="scr-warn" role="alert">{t('screen.sound_off')}</p>}
            {msg && <p className="scr-warn" role="alert">{msg}</p>}
            <button type="button" className="btn--staff scr-go__btn" disabled={!selected || busy} onClick={() => selected && go(selected)}>
              {selected ? `${t('screen.go')}: ${t(screenLabel(selected))}` : t('screen.pick')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
