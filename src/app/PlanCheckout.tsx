import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, FlaskConical, Sparkles } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { describeError } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { api, OFFERS, type PaidPlan } from './api';
import { refreshMe, useAccount } from './account';

const TIER_TEXT = {
  solo: { title: 'StudySpace Solo', points: ['Persönlicher Lernplan und Hausaufgaben', 'Prüfungen, Fokusmodus und Statistiken', 'Erinnerungen'] },
  group: { title: 'StudySpace Gruppe', points: ['Alle Solo-Funktionen', 'Gemeinsamer Lernplan, Gruppenfortschritt und Ziele', 'Bis zu 8 Lernende – nur du bezahlst'] },
} as const;

/** Kleine Konfetti-Feier nach einem (simulierten) Kauf. */
async function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const confetti = (await import('canvas-confetti')).default;
  void confetti({ particleCount: 90, spread: 70, startVelocity: 38, origin: { y: 0.7 }, colors: ['#7C6FF0', '#B9A8FF', '#A6DED7', '#F5C9A8'] });
}

/**
 * Tarifwahl mit Laufzeit (monatlich oder 6 Monate). In der Beta wird der Kauf
 * nur SIMULIERT: Der Server legt den Zugang an und vermerkt ihn im Admin-Bereich
 * als Beta-Kauf – es wird nichts berechnet und nichts als Umsatz gezählt.
 */
export function PlanCheckout({ tier, onDone, compact }: { tier: 'solo' | 'group'; onDone?: (r: { group_id: string | null }) => void; compact?: boolean }) {
  const reduce = useReducedMotion();
  const beta = useAccount((s) => s.me?.beta_purchases ?? false);
  const [plan, setPlan] = useState<PaidPlan>(tier === 'solo' ? 'solo_semester' : 'group_semester');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const options = (Object.values(OFFERS) as (typeof OFFERS)[PaidPlan][]).filter((o) => o.tier === tier);
  const offer = OFFERS[plan];
  const monthlyEquivalent = offer.period === 'semester' ? `≈ ${(offer.cents / 600).toFixed(2).replace('.', ',')} € pro Monat` : null;

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.betaPurchase(getSupabase(), plan);
      await refreshMe();
      setDone(true);
      void celebrate();
      setTimeout(() => onDone?.({ group_id: r.group_id }), reduce ? 200 : 1300);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5" data-testid={`checkout-${tier}`}>
      {!compact && (
        <div>
          <p className="text-[15px] font-semibold">{TIER_TEXT[tier].title}</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-muted">
            {TIER_TEXT[tier].points.map((p) => (
              <li key={p} className="flex gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Laufzeit">
        {options.map((o) => {
          const on = o.id === plan;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPlan(o.id)}
              data-testid={`offer-${o.id}`}
              className={`relative rounded-[18px] border p-3 text-left transition-[border-color,background-color,transform] duration-200 active:scale-[0.98] ${
                on ? 'border-[var(--ss-accent)] bg-[color-mix(in_srgb,var(--ss-accent)_10%,transparent)]' : 'border-line hover:bg-[color-mix(in_srgb,var(--ss-text)_4%,transparent)]'
              }`}
            >
              {o.period === 'semester' && (
                <span className="absolute -top-2 right-2 rounded-full bg-[var(--ss-accent)] px-2 py-0.5 text-[10.5px] font-semibold text-white">Semester</span>
              )}
              <p className="text-[12px] font-medium text-muted">{o.period === 'monthly' ? 'Monatlich' : '6 Monate'}</p>
              <p className="num text-[21px] font-semibold leading-tight">{o.price}</p>
              <p className="text-[11.5px] text-muted">{o.per}</p>
            </button>
          );
        })}
      </div>
      <p className="text-[12px] leading-snug text-muted">
        {offer.note}
        {monthlyEquivalent && ` · ${monthlyEquivalent}`}
      </p>

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div
            key="done"
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-center gap-2 rounded-2xl bg-[color-mix(in_srgb,#2FA58B_14%,transparent)] px-4 py-3 text-[14.5px] font-semibold text-[#2FA58B]"
            data-testid="checkout-done"
          >
            <Check className="size-5" aria-hidden /> Freigeschaltet
          </motion.div>
        ) : beta ? (
          <motion.div key="buy" className="flex flex-col gap-2" exit={{ opacity: 0 }}>
            {error && (
              <p role="alert" className="rounded-2xl bg-[color-mix(in_srgb,var(--ss-danger)_12%,transparent)] px-3.5 py-2.5 text-[13px] text-danger">
                {error}
              </p>
            )}
            <Button variant="primary" size="lg" loading={busy} icon={<Sparkles className="size-4" />} onClick={() => void buy()} data-testid="checkout-buy">
              {offer.price} – Kauf simulieren
            </Button>
            <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-faint">
              <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Beta: Es wird nichts berechnet und keine Zahlungsdaten abgefragt. Der Kauf wird nur für den Testbetrieb erfasst.
            </p>
          </motion.div>
        ) : (
          <motion.p key="closed" className="rounded-2xl border border-line px-3.5 py-2.5 text-[13px] text-muted" data-testid="checkout-closed">
            Käufe sind gerade noch nicht geöffnet. Wir melden uns, sobald es losgeht.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
