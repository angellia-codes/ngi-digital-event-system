import type { CSSProperties } from 'react';

/** Original inline SVG art for the invitation. Brand colours only (see tokens.css). Motion lives in invite.css. */

export function Cassette({ label }: { label: string }) {
  const reel = (cx: number) => (
    <g transform={`translate(${cx} 74)`}>
      <g className="art-reel">
        <circle r="17" fill="#0D0D0D" />
        <circle r="7" fill="#D4AF37" />
        <path d="M0-17V-7M15-8.5L6-3.5M-15-8.5L-6-3.5" stroke="#D4AF37" strokeWidth="3" />
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 240 150" className="art-cassette" role="img" aria-label={label}>
      <rect x="4" y="4" width="232" height="142" rx="12" fill="#FF1B6B" stroke="#0D0D0D" strokeWidth="4" />
      <rect x="22" y="14" width="196" height="50" rx="6" fill="#D4AF37" />
      <text x="120" y="45" textAnchor="middle" fontFamily="var(--nf-font-heading)" fontSize={Math.min(20, 190 / (label.length * 0.52))} fill="#0D0D0D">{label}</text>
      <rect x="40" y="52" width="160" height="44" rx="22" fill="#0D0D0D" opacity="0.85" />
      {reel(80)}
      {reel(160)}
      <path d="M70 146 L84 124 H156 L170 146Z" fill="#0D0D0D" />
    </svg>
  );
}

export function Boombox() {
  const speaker = (cx: number) => (
    <g transform={`translate(${cx} 92)`}>
      <circle r="34" fill="#0D0D0D" stroke="#D4AF37" strokeWidth="4" />
      <circle r="20" fill="#2a2a2a" className="art-sp" />
      <circle r="7" fill="#FF1B6B" />
    </g>
  );
  const windowReel = (cx: number) => (
    <g className="art-wr">
      <circle cx={cx} cy="68" r="8" fill="#0D0D0D" />
      <rect x={cx - 1} y="61" width="2" height="14" fill="#D4AF37" />
    </g>
  );
  return (
    <svg viewBox="0 0 320 170" className="art-boombox" aria-hidden="true">
      <path d="M90 28 Q160 -6 230 28" fill="none" stroke="#D4AF37" strokeWidth="8" strokeLinecap="round" />
      <rect x="6" y="28" width="308" height="136" rx="16" fill="#39FF14" stroke="#0D0D0D" strokeWidth="5" />
      {speaker(64)}
      {speaker(256)}
      <rect x="112" y="46" width="96" height="44" rx="6" fill="#0D0D0D" />
      <rect x="120" y="54" width="80" height="28" rx="4" fill="#D4AF37" />
      {windowReel(138)}
      {windowReel(182)}
      <rect x="116" y="104" width="88" height="10" rx="5" fill="#0D0D0D" />
      <circle cx="132" cy="136" r="9" fill="#FF1B6B" stroke="#0D0D0D" strokeWidth="3" />
      <circle cx="160" cy="136" r="9" fill="#D4AF37" stroke="#0D0D0D" strokeWidth="3" />
      <circle cx="188" cy="136" r="9" fill="#FF1B6B" stroke="#0D0D0D" strokeWidth="3" />
    </svg>
  );
}


export function MapPin({ className = 'art-pin', style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 80 100" className={className} style={style} aria-hidden="true">
      <path d="M40 4C21 4 8 18 8 36c0 24 32 62 32 62s32-38 32-62C72 18 59 4 40 4z" fill="#FF1B6B" stroke="#0D0D0D" strokeWidth="4" />
      <circle cx="40" cy="36" r="12" fill="#0D0D0D" />
    </svg>
  );
}

/** A generic street grid for the Where scene. Not a real map. */
export function MapStreets() {
  return (
    <svg viewBox="0 0 248 160" preserveAspectRatio="none" className="art-streets" aria-hidden="true">
      <rect x="150" y="14" width="70" height="50" fill="#39FF14" opacity="0.16" />
      <g stroke="#D4AF37" strokeOpacity="0.35" strokeWidth="7" fill="none">
        <path d="M0 92 H248" /><path d="M60 0 V160" /><path d="M182 0 L140 160" />
      </g>
      <g stroke="#4a4a4a" strokeWidth="2" fill="none">
        <path d="M0 40 H248" /><path d="M0 132 H248" /><path d="M112 0 V160" /><path d="M224 0 V160" />
      </g>
    </svg>
  );
}

/** The Polaroid photo: an illustrated crowd at the NourishFest stage (motion spec §5.2). */
export function Crowd() {
  return (
    <svg viewBox="0 0 120 120" className="art-crowd" role="img" aria-label="Crowd at the NourishFest stage">
      <rect width="120" height="120" fill="#1b0a13" />
      <polygon points="22,0 32,0 62,120 30,120" fill="#FF1B6B" opacity="0.5" />
      <polygon points="88,0 98,0 92,120 58,120" fill="#39FF14" opacity="0.38" />
      <polygon points="55,0 65,0 82,120 38,120" fill="#D4AF37" opacity="0.32" />
      <circle cx="27" cy="4" r="4" fill="#D4AF37" />
      <circle cx="60" cy="4" r="4" fill="#D4AF37" />
      <circle cx="93" cy="4" r="4" fill="#D4AF37" />
      <rect x="24" y="44" width="72" height="14" fill="#D4AF37" />
      <text x="60" y="54.5" textAnchor="middle" fontFamily="var(--nf-font-display)" fontSize="7.5" fill="#0D0D0D">NOURISHFEST</text>
      <rect x="0" y="78" width="120" height="42" fill="#FF1B6B" opacity="0.22" />
      <g fill="#0D0D0D" stroke="#0D0D0D" strokeLinecap="round">
        <path d="M14 100 L8 74" strokeWidth="5" /><circle cx="8" cy="72" r="3.5" />
        <path d="M50 98 L44 70" strokeWidth="5" /><path d="M58 98 L66 72" strokeWidth="5" />
        <circle cx="44" cy="68" r="3.5" /><circle cx="66" cy="70" r="3.5" />
        <path d="M100 98 L110 76" strokeWidth="5" /><circle cx="111" cy="74" r="3.5" />
        <circle cx="10" cy="98" r="9" /><circle cx="30" cy="102" r="9" /><circle cx="54" cy="96" r="9" />
        <circle cx="76" cy="101" r="9" /><circle cx="98" cy="97" r="9" /><circle cx="118" cy="102" r="9" />
        <rect x="0" y="104" width="120" height="16" stroke="none" />
      </g>
    </svg>
  );
}
