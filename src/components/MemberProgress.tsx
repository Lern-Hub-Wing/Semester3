import type { Member } from '../lib/types';
import { memberRatio, type Ratio, type TaskView } from '../lib/progress';
import { navigate } from '../lib/router';
import { useData } from '../store/data';
import { usePrefs } from '../store/prefs';
import { ProgressBar, ProgressRing } from './ui/Progress';
import { Avatar } from './ui/Avatar';

interface Props {
  member: Member;
  ratio: Ratio;
  ringSize?: number;
  onClick?: () => void;
  highlight?: boolean;
  forceStyle?: 'ring' | 'bar';
}

/** Fortschritt einer Person – als Kreis oder Balken (Geräteeinstellung). */
export function MemberProgress({ member, ratio, ringSize = 84, onClick, highlight, forceStyle }: Props) {
  const style = usePrefs((s) => forceStyle ?? s.progressStyle);
  const Tag = onClick ? 'button' : 'div';
  if (style === 'ring') {
    return (
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`group flex flex-col items-center gap-2 rounded-2xl p-2 text-center transition-colors ${onClick ? 'hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]' : ''}`}
        aria-label={onClick ? `Details zu ${member.name}` : undefined}
      >
        <ProgressRing ratio={ratio} color={member.color} size={ringSize} stroke={Math.max(6, ringSize / 10)} sublabel={member.name} />
        <span className="flex max-w-[110px] items-center gap-1.5 text-[13px] font-medium">
          <span className="size-2 shrink-0 rounded-full" style={{ background: member.color }} aria-hidden />
          <span className="truncate">{member.name}</span>
          {highlight && <span className="text-[11px] font-normal text-muted">(du)</span>}
        </span>
      </Tag>
    );
  }
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors ${onClick ? 'hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]' : ''}`}
      aria-label={onClick ? `Details zu ${member.name}` : undefined}
    >
      <Avatar name={member.name} color={member.color} size={30} />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
          <span className="truncate font-medium">
            {member.name}
            {highlight && <span className="ml-1 font-normal text-muted">(du)</span>}
          </span>
          <span className="num shrink-0 font-semibold">{ratio.pct === null ? '–' : `${ratio.pct}%`}</span>
        </div>
        <ProgressBar ratio={ratio} color={member.color} label={`Fortschritt ${member.name}`} />
      </div>
    </Tag>
  );
}

/**
 * Fortschritt aller aktiven Personen als responsives Raster (Kreise) bzw. Liste
 * (Balken). Kreise brechen automatisch um – nie abgeschnitten, nie gequetscht.
 */
export function TeamProgressGrid({
  members, views, meId, ringSize = 78, className = '',
}: { members: Member[]; views: TaskView[]; meId: string; ringSize?: number; className?: string }) {
  const completions = useData((s) => s.task_completions);
  const style = usePrefs((s) => s.progressStyle);
  return (
    <div
      data-testid="team-progress"
      className={`${style === 'ring' ? 'grid justify-items-center gap-x-1 gap-y-2' : 'flex flex-col gap-1'} ${className}`}
      style={style === 'ring' ? { gridTemplateColumns: `repeat(auto-fill, minmax(${ringSize + 22}px, 1fr))` } : undefined}
    >
      {members.map((m) => (
        <MemberProgress
          key={m.id}
          member={m}
          ratio={memberRatio(views, m.id, completions)}
          ringSize={ringSize}
          highlight={m.id === meId}
          onClick={() => navigate(`/team/${m.id}`)}
        />
      ))}
    </div>
  );
}
