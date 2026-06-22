interface XpRingProps {
  level: number;
  /** 0..1 progress to next level */
  progress: number;
  size?: number;
}

/**
 * Signature element: the hero level ring. A gold XP-energy arc fills toward the
 * next level around a large level numeral. This is the one bold thing on screen.
 */
export function XpRing({ level, progress, size = 168 }: XpRingProps) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const dash = c * clamped;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="ring-glow -rotate-90">
        <defs>
          <linearGradient id="xpgrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-xp)" />
            <stop offset="100%" stopColor="var(--color-xp2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#xpgrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 700ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="eyebrow">Level</span>
        <span className="font-display text-5xl font-bold leading-none text-ink">{level}</span>
        <span className="hud mt-1 text-xs text-xp">{Math.round(clamped * 100)}%</span>
      </div>
    </div>
  );
}
