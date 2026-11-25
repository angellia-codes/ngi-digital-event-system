'use client';
import { useState } from 'react';
import { stageLinkText } from '@/lib/admin-draw-text';
import { api } from '@/lib/client';
import { heartbeatState } from '@/lib/draw-ui';
import { STAGE_VIDEOS, stageVideo, type StageVideoKey } from '@/lib/stage-videos';
import { useLoad } from '@/lib/use-load';

type StageInfo = { stage: { rev: number; phase: string; payload: { video?: string } }; heartbeat_age: number | null };

const PHASE_TEXT: Record<string, string> = {
  idle: 'the draw board (waiting screen)',
  intro: 'a prize banner (door prize)',
  rolling: 'a door prize number',
  revealed: 'a door prize winner',
  void: 'a door prize redraw',
};

const ERRORS: Record<string, string> = {
  DRAW_IN_PROGRESS: 'A door prize number is waiting for the MC. Play a video after the MC confirms or marks a no-show.',
  NOT_PLAYING: 'No video was playing.',
  INVALID_VIDEO: 'Unknown video.',
};

export function StageVideos() {
  const { data, reload } = useLoad<StageInfo>('/api/admin/stage', 2_000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(video: StageVideoKey | null) {
    setBusy(true);
    const r = await api<{ status: string }>('/api/admin/stage/video', { video });
    setBusy(false);
    if (r.status === 'OK') setMsg(null);
    else setMsg({ ok: false, text: ERRORS[r.status] ?? 'Could not change the stage. Check the connection and try again.' });
    reload();
  }

  const playing = data?.stage.phase === 'video' ? stageVideo(data.stage.payload?.video) : undefined;
  const link = heartbeatState(data?.heartbeat_age);
  const onScreen = !data ? 'Loading…' : playing ? `${playing.label} (${playing.once ? 'plays once, then the draw board' : 'loop'})` : PHASE_TEXT[data.stage.phase] ?? data.stage.phase;

  return (
    <>
      <div className="adm-card">
        <p>
          <span className={`adm-dot ${link === 'ok' ? 'adm-dot--ok' : link === 'down' ? 'adm-dot--down' : ''}`} />
          {data ? stageLinkText(data.heartbeat_age) : 'Loading…'}
        </p>
        <p className="adm-video-now">On screen now: <b>{onScreen}</b></p>
        <div className="adm-row">
          <button className="btn btn--danger adm-video-stop" disabled={busy || !playing} onClick={() => send(null)}>
            ■ Stop video
          </button>
        </div>
        <p className="adm-muted">Stop returns the stage to the draw board. When the MC shows a prize, the draw replaces the video on its own.</p>
      </div>

      <div className="adm-video-grid">
        {STAGE_VIDEOS.map((v) => {
          const live = playing?.key === v.key;
          return (
            <div key={v.key} className={`adm-card adm-video${live ? ' adm-video--live' : ''}`}>
              <p className="adm-video__name">{v.label}</p>
              <p className="adm-muted adm-video__file">{v.file}</p>
              {v.once && <p className="adm-muted adm-video__file">Plays once with sound (press S on the stage laptop first), then the draw board.</p>}
              <button className="btn btn--gold" disabled={busy || live} onClick={() => send(v.key)}>
                {live ? (v.once ? 'Started' : 'Playing now') : v.once ? '▶ Play once' : '▶ Play'}
              </button>
            </div>
          );
        })}
      </div>
      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`} role="alert">{msg.text}</p>}
    </>
  );
}
