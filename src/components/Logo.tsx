import { DEFAULT_MEMBER_COLORS } from '../lib/colors';

/** StudySpace-Zeichen: vier Bögen (die Gruppe) bilden gemeinsam einen vollen Kreis. */
export function LogoMark({ size = 40, colors = DEFAULT_MEMBER_COLORS }: { size?: number; colors?: string[] }) {
  const c = colors.length >= 4 ? colors.slice(0, 4) : DEFAULT_MEMBER_COLORS;
  const r = 15;
  const len = 2 * Math.PI * r;
  const seg = len / 4;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <radialGradient id="ss-core" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#dfe6f7" stopOpacity="0.6" />
        </radialGradient>
      </defs>
      <g transform="rotate(-90 20 20)">
        {c.map((color, i) => (
          <circle
            key={i}
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeDasharray={`${seg - 8.4} ${len - seg + 8.4}`}
            strokeDashoffset={-i * seg - 4.2}
          />
        ))}
      </g>
      <circle cx="20" cy="20" r="5.2" fill="url(#ss-core)" />
    </svg>
  );
}

export function Logo({ name = 'StudySpace' }: { name?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={32} />
      <span className="text-[17px] font-semibold tracking-tight">{name}</span>
    </span>
  );
}
