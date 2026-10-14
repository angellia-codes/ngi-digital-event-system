/** Original inline SVG art for the invitation. Brand colours only (see tokens.css). */

export function Cassette({ label, spin = false }: { label: string; spin?: boolean }) {
  const reel = (cx: number) => (
    <g transform={`translate(${cx} 74)`}>
      <g className={spin ? 'art-spin' : undefined}>
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

export function Boombox({ playing }: { playing: boolean }) {
  const speaker = (cx: number) => (
    <g transform={`translate(${cx} 92)`}>
      <circle r="34" fill="#0D0D0D" stroke="#D4AF37" strokeWidth="4" />
      <circle r="20" fill="#2a2a2a" className={playing ? 'art-pump' : undefined} />
      <circle r="7" fill="#FF1B6B" />
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
      <circle cx="132" cy="68" r="6" fill="#0D0D0D" />
      <circle cx="188" cy="68" r="6" fill="#0D0D0D" />
      <rect x="116" y="104" width="88" height="10" rx="5" fill="#0D0D0D" />
      <circle cx="132" cy="136" r="9" fill="#FF1B6B" stroke="#0D0D0D" strokeWidth="3" />
      <circle cx="160" cy="136" r="9" fill="#D4AF37" stroke="#0D0D0D" strokeWidth="3" />
      <circle cx="188" cy="136" r="9" fill="#FF1B6B" stroke="#0D0D0D" strokeWidth="3" />
    </svg>
  );
}

export function Equalizer() {
  return (
    <div className="eq" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 97) % 600}ms` }} />)}
    </div>
  );
}

export function MapPin() {
  return (
    <svg viewBox="0 0 80 110" className="art-pin" aria-hidden="true">
      <ellipse cx="40" cy="102" rx="22" ry="5" fill="#000" opacity="0.5" />
      <path d="M40 4C21 4 8 18 8 36c0 24 32 62 32 62s32-38 32-62C72 18 59 4 40 4z" fill="#FF1B6B" stroke="#0D0D0D" strokeWidth="4" />
      <circle cx="40" cy="36" r="12" fill="#0D0D0D" />
    </svg>
  );
}
