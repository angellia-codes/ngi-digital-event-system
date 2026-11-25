'use client';
import { useEffect, useState } from 'react';
import type { StageVideoKey } from '@/lib/stage-videos';

type Source = (key: StageVideoKey) => Promise<{ src: string; local: boolean } | null>;

/**
 * One loop, full screen, silent, repeating until the stage changes. It fills the whole window (not the 16:9 board),
 * so a 1520 × 640 loop fills the LED wall and gets black bars on a 16:9 projector. Never cropped.
 * If the file cannot play, the element hides itself and the idle board underneath shows instead.
 */
export function StageVideo({ videoKey, source }: { videoKey: StageVideoKey; source: Source }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    setFailed(false);
    setSrc(null);
    source(videoKey).then((r) => {
      if (cancelled || !r) { if (r?.local) URL.revokeObjectURL(r.src); return; }
      if (r.local) made = r.src;
      setSrc(r.src);
    });
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [videoKey, source]);

  if (failed) return null;
  if (!src) return <div className="stage__video" />; // black for the moment it takes to read the file
  return (
    <video
      key={src}
      className="stage__video"
      src={src}
      autoPlay
      muted
      loop
      playsInline
      disablePictureInPicture
      preload="auto"
      onError={() => setFailed(true)}
    />
  );
}
