'use client';
import { useMemo, type CSSProperties } from 'react';
import { qrPath } from '@/lib/qr-svg';

/**
 * White tile, black modules, quiet zone of 4 modules, integer pixels per module (at least 5).
 * `--qr-mods` lets CSS pick a whole-pixel module size per breakpoint instead of scaling to a fractional width.
 */
export function QrTile({ payload, frame, ppm = 6, alt }: { payload: string; frame: 'gold' | 'pink'; ppm?: number; alt: string }) {
  const { size, d } = useMemo(() => qrPath(payload), [payload]);
  const px = size * Math.max(5, Math.floor(ppm));
  return (
    <div className={`qr-frame qr-frame--${frame}`} style={{ '--qr-mods': size } as CSSProperties}>
      <svg role="img" aria-label={alt} width={px} height={px} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges">
        <rect width={size} height={size} fill="#FFFFFF" />
        <path d={d} fill="#000000" />
      </svg>
    </div>
  );
}
