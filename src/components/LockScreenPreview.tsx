import { motion, useReducedMotion } from 'motion/react';
import { BarChart3 } from 'lucide-react';
import { useNow } from '../hooks/useNow';
import { formatInstant } from '../lib/time';
import { Landscape } from './landscape/Landscape';
import { LogoMark } from './Logo';

/**
 * Sperrbildschirm-Darstellung einer StudySpace-Benachrichtigung (Illustration
 * im Stil der Vorlage). Uhrzeit und Datum laufen live mit. Das tatsächliche
 * Aussehen auf dem Gerät bestimmt das Betriebssystem.
 */
export function LockScreenPreview({
  title,
  body,
  when = 'Jetzt',
  compact = false,
  className = '',
}: {
  title: string;
  body: string;
  when?: string;
  compact?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const now = useNow(1000);
  const date = formatInstant(new Date(now), { weekday: 'long', day: 'numeric', month: 'long' });
  const time = formatInstant(new Date(now), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return (
    <div className={`hero-scene relative overflow-hidden rounded-[28px] ${compact ? 'px-4 pb-4 pt-5' : 'px-5 pb-5 pt-7'} ${className}`} data-testid="lockscreen-preview">
      <Landscape />
      {/* Lichtschleier wie ein Wallpaper */}
      <div
        aria-hidden
        className="absolute inset-0 !z-0 opacity-80"
        style={{ background: 'radial-gradient(90% 70% at 85% 10%, rgba(169,166,255,.45), transparent 60%), linear-gradient(160deg, rgba(110,96,236,.35), rgba(60,90,200,.15) 55%, transparent)' }}
      />
      <div className="flex flex-col items-center text-center on-image">
        <p className={`font-medium ${compact ? 'text-[12px]' : 'text-[14px]'} text-ink/80`}>{date}</p>
        <p className={`num font-semibold leading-none tracking-[-0.04em] ${compact ? 'mt-1 text-[48px]' : 'mt-1.5 text-[68px]'}`}>{time}</p>
      </div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: -16, scale: 0.96 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.25 }}
        className={`glass mat-float relative mx-auto flex w-full max-w-[420px] items-start gap-3 rounded-[20px] px-3.5 py-3 text-left ${compact ? 'mt-4' : 'mt-6'}`}
        aria-label={`Beispiel einer Benachrichtigung: ${title} – ${body}`}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#0f1424] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
          <LogoMark size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2 text-[12.5px]">
            <span className="font-semibold">StudySpace</span>
            <span className="text-muted">{when}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[13.5px] font-semibold leading-snug">
            <BarChart3 className="size-3.5 shrink-0 text-accent" aria-hidden />
            <span className="truncate">{title}</span>
          </span>
          <span className="block text-[13px] leading-snug text-muted">{body}</span>
        </span>
      </motion.div>
    </div>
  );
}
