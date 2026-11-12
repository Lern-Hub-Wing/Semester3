import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, Table2, Download } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { DEFAULT_SIM, simulate, totals, type SimInput, type SimMonth, type SimPlan } from './simulate';
import type { Stats } from './client';

const STORE_KEY = 'studyspace.admin.sim.v1';
const eur = (n: number, digits = 0) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: digits, minimumFractionDigits: digits });
const int = (n: number) => Math.round(n).toLocaleString('de-DE');

function load(): SimInput {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULT_SIM, ...JSON.parse(raw), start: { ...DEFAULT_SIM.start, ...JSON.parse(raw).start } };
  } catch {
    /* Standardwerte */
  }
  return DEFAULT_SIM;
}

const PLAN_TITLES: Record<SimPlan, string> = {
  solo_monthly: 'Solo monatlich (2,49 €)',
  solo_semester: 'Solo 6 Monate (11,99 €)',
  group_monthly: 'Gruppe monatlich (4,99 €)',
  group_semester: 'Gruppe 6 Monate (24,99 €)',
};

/** Farben: die ersten drei Plätze der geprüften Kategorie-Palette (hell/dunkel). */
const VIZ_STYLE = `
.viz-root { --series-1:#2a78d6; --series-2:#eb6834; --series-3:#1baf7a; --grid: color-mix(in srgb, var(--ss-text) 9%, transparent); --zero: color-mix(in srgb, var(--ss-text) 35%, transparent); }
:root[data-theme="dark"] .viz-root, :root.dark .viz-root { --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70; }
`;
const SERIES = [
  { key: 'gross' as const, label: 'Brutto', color: 'var(--series-1)' },
  { key: 'net' as const, label: 'Netto (nach USt & Gebühren)', color: 'var(--series-2)' },
  { key: 'profit' as const, label: 'Gewinn (nach Kosten & Steuern)', color: 'var(--series-3)' },
];

export function FinanceSimulator({ stats }: { stats: Stats | null }) {
  const [input, setInput] = useState<SimInput>(load);
  const [showTable, setShowTable] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(input));
    } catch {
      /* optional */
    }
  }, [input]);
  const rows = useMemo(() => simulate(input), [input]);
  const sum = useMemo(() => totals(rows), [rows]);
  const last = rows[rows.length - 1];
  const set = <K extends keyof SimInput>(k: K, v: SimInput[K]) => setInput((s) => ({ ...s, [k]: v }));

  const fromCurrent = () => {
    if (!stats) return;
    const pick = (p: SimPlan) => (stats.beta_by_plan?.[p] ?? 0) + (stats.paid_by_plan?.[p] ?? 0);
    setInput((s) => ({
      ...s,
      start: { solo_monthly: pick('solo_monthly'), solo_semester: pick('solo_semester'), group_monthly: pick('group_monthly'), group_semester: pick('group_semester') },
      membersPerGroup: stats.groups_total > 0 ? Math.max(1, Math.round((stats.group_members_total / stats.groups_total) * 10) / 10) : s.membersPerGroup,
    }));
  };

  const csv = () => {
    const head = 'Monat;Zahlende Abos;Nutzer;Brutto;USt;Gebühren;Netto;Kosten;Steuern;Gewinn;Gewinn kumuliert';
    const body = rows.map((r) => [r.month, r.payers.toFixed(1), r.users.toFixed(0), r.gross, r.vat, r.fees, r.net, r.costs, r.tax, r.profit, r.cumulativeProfit].join(';').replace(/\./g, ','));
    const blob = new Blob([[head, ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'studyspace-simulation.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="viz-root" data-testid="admin-finance">
      <style>{VIZ_STYLE}</style>
      <p className="mb-4 rounded-2xl bg-[color-mix(in_srgb,var(--ss-accent)_10%,transparent)] px-4 py-3 text-[13.5px] text-muted">
        <strong className="text-ink">Simulation – keine echten Umsätze.</strong> Preise sind Endkundenpreise inkl. USt. Semesterpässe werden im Kaufmonat gezählt
        (Zahlungsfluss). Alle Annahmen sind anpassbar und werden nur in diesem Browser gespeichert.
      </p>

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Annahmen */}
        <div className="flex flex-col gap-4">
          <Group title="Startbestand (zahlende Abos)">
            {(Object.keys(PLAN_TITLES) as SimPlan[]).map((p) => (
              <Num key={p} label={PLAN_TITLES[p]} value={input.start[p]} min={0} step={1} onChange={(v) => set('start', { ...input.start, [p]: v })} />
            ))}
            <Range label="Hochskalieren" value={input.scale} min={1} max={100} step={1} format={(v) => `× ${v}`} onChange={(v) => set('scale', v)} />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={fromCurrent} disabled={!stats} data-testid="sim-from-current">
                Aktuelle Zahlen übernehmen
              </Button>
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setInput(DEFAULT_SIM)}>
                Zurücksetzen
              </Button>
            </div>
            <p className="text-[11.5px] text-faint">Übernimmt aktive Beta- und echte Abos je Tarif sowie die durchschnittliche Gruppengröße.</p>
          </Group>

          <Group title="Wachstum">
            <Num label="Neue zahlende Abos pro Monat" value={input.newPerMonth} min={0} step={1} onChange={(v) => set('newPerMonth', v)} />
            <Range label="Wachstum der Neuzugänge" value={input.growthPct} min={-20} max={50} step={1} format={(v) => `${v} % / Monat`} onChange={(v) => set('growthPct', v)} />
            <Range label="Anteil Gruppe" value={input.groupSharePct} min={0} max={100} step={5} format={(v) => `${v} % Gruppe · ${100 - v} % Solo`} onChange={(v) => set('groupSharePct', v)} />
            <Range label="Anteil 6-Monats-Pass" value={input.semesterSharePct} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={(v) => set('semesterSharePct', v)} />
            <Range label="Kündigungen Monatsabos" value={input.churnPct} min={0} max={30} step={0.5} format={(v) => `${v} % / Monat`} onChange={(v) => set('churnPct', v)} />
            <Range label="Pass erneut gekauft" value={input.semesterRenewPct} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={(v) => set('semesterRenewPct', v)} />
            <Range label="Personen je Gruppe" value={input.membersPerGroup} min={1} max={8} step={0.5} format={(v) => `${v}`} onChange={(v) => set('membersPerGroup', v)} />
          </Group>

          <Group title="Zahlungswege & Abzüge">
            <Range label="Web (Stripe)" value={input.webPct} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={(v) => set('webPct', v)} />
            <Range label="App Store" value={input.appStorePct} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={(v) => set('appStorePct', v)} />
            <Range label="Google Play" value={input.playPct} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={(v) => set('playPct', v)} />
            {input.webPct + input.appStorePct + input.playPct !== 100 && (
              <p className="text-[11.5px] text-warn">Summe {input.webPct + input.appStorePct + input.playPct} % – wird anteilig auf 100 % umgerechnet.</p>
            )}
            <Num label="Stripe-Gebühr (%)" value={input.stripePct} min={0} step={0.1} onChange={(v) => set('stripePct', v)} />
            <Num label="Stripe fest je Zahlung (€)" value={input.stripeFixed} min={0} step={0.05} onChange={(v) => set('stripeFixed', v)} />
            <Num label="Store-Provision (%)" value={input.storePct} min={0} step={1} onChange={(v) => set('storePct', v)} />
            <Num label="Umsatzsteuer (%)" value={input.vatPct} min={0} step={1} onChange={(v) => set('vatPct', v)} />
          </Group>

          <Group title="Kosten & Steuern">
            <Num label="Fixkosten pro Monat (€)" value={input.fixedCosts} min={0} step={5} onChange={(v) => set('fixedCosts', v)} />
            <Num label="Kosten je Nutzer und Monat (€)" value={input.costPerUser} min={0} step={0.01} onChange={(v) => set('costPerUser', v)} />
            <Num label="Steuer auf Gewinn, Schätzung (%)" value={input.taxPct} min={0} max={60} step={1} onChange={(v) => set('taxPct', v)} />
            <p className="text-[11.5px] text-faint">Fixkosten z. B. Supabase Pro (~25 €), Apple-Entwicklerkonto (~8 € anteilig), Domain.</p>
          </Group>
        </div>

        {/* Ergebnis */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Segmented
              label="Zeitraum"
              size="sm"
              value={String(input.months)}
              onChange={(v) => set('months', Number(v))}
              options={[
                { value: '12', label: '12 Monate' },
                { value: '24', label: '24 Monate' },
                { value: '36', label: '36 Monate' },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi label={`Brutto ${input.months} Monate`} value={eur(sum.gross)} />
            <Kpi label={`Gewinn ${input.months} Monate`} value={eur(sum.profit)} tone={sum.profit < 0 ? 'neg' : 'pos'} testId="sim-profit" />
            <Kpi label={`Monat ${input.months}: Gewinn`} value={eur(last.profit)} sub={`Brutto ${eur(last.gross)}`} />
            <Kpi label="Gewinnschwelle" value={sum.breakEven ? `Monat ${sum.breakEven}` : 'nicht erreicht'} sub={`${int(last.payers)} Abos · ${int(last.users)} Nutzer`} />
          </div>

          <div className="glass rounded-[24px] p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted" aria-hidden>
              {SERIES.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className="h-[3px] w-4 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
            <LineChart rows={rows} />
          </div>

          <div className="glass rounded-[24px] p-4 md:p-5">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Von Brutto zu Gewinn ({input.months} Monate)</p>
            <Breakdown label="Brutto (Kunden zahlen)" value={sum.gross} strong />
            <Breakdown label={`− Umsatzsteuer (${input.vatPct} %)`} value={-sum.vat} />
            <Breakdown label="− Zahlungs- und Store-Gebühren" value={-sum.fees} />
            <Breakdown label="= Netto" value={sum.net} strong />
            <Breakdown label="− Kosten (fix + je Nutzer)" value={-sum.costs} />
            <Breakdown label="− Steuern (Schätzung)" value={-sum.tax} />
            <Breakdown label="= Gewinn" value={sum.profit} strong tone={sum.profit < 0 ? 'neg' : 'pos'} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" icon={<Table2 className="size-4" />} onClick={() => setShowTable((v) => !v)} data-testid="sim-table-toggle">
                {showTable ? 'Tabelle ausblenden' : 'Monatstabelle'}
              </Button>
              <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={csv}>
                CSV
              </Button>
            </div>
            {showTable && <MonthTable rows={rows} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass rounded-[22px] p-4">
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Num({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[13px]">
      <span className="min-w-0 text-muted">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        className="field num !h-9 w-24 shrink-0 !px-2.5 text-right"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(v)) onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v)));
        }}
      />
    </label>
  );
}

function Range({ label, value, onChange, min, max, step, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; format: (v: number) => string }) {
  return (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="flex justify-between gap-2">
        <span className="text-muted">{label}</span>
        <span className="num font-medium">{format(value)}</span>
      </span>
      <input type="range" className="w-full accent-[var(--ss-accent)]" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Kpi({ label, value, sub, tone, testId }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg'; testId?: string }) {
  return (
    <div className="glass rounded-[20px] p-4" data-testid={testId}>
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className={`num mt-1 text-[21px] font-semibold leading-tight ${tone === 'neg' ? 'text-danger' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11.5px] text-faint">{sub}</p>}
    </div>
  );
}

function Breakdown({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: 'pos' | 'neg' }) {
  return (
    <div className={`flex justify-between gap-3 border-t border-line py-2 text-[13.5px] first-of-type:border-t-0 ${strong ? 'font-semibold' : 'text-muted'}`}>
      <span>{label}</span>
      <span className={`num ${tone === 'neg' ? 'text-danger' : ''}`}>{eur(value, 2)}</span>
    </div>
  );
}

function MonthTable({ rows }: { rows: SimMonth[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="num w-full min-w-[640px] text-right text-[12.5px]">
        <thead className="text-muted">
          <tr>
            {['Monat', 'Abos', 'Nutzer', 'Brutto', 'USt', 'Gebühren', 'Netto', 'Kosten', 'Gewinn', 'kumuliert'].map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium first:text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-t border-line">
              <td className="px-2 py-1.5 text-left">{r.month}</td>
              <td className="px-2 py-1.5">{int(r.payers)}</td>
              <td className="px-2 py-1.5">{int(r.users)}</td>
              <td className="px-2 py-1.5">{eur(r.gross)}</td>
              <td className="px-2 py-1.5">{eur(r.vat)}</td>
              <td className="px-2 py-1.5">{eur(r.fees)}</td>
              <td className="px-2 py-1.5">{eur(r.net)}</td>
              <td className="px-2 py-1.5">{eur(r.costs)}</td>
              <td className={`px-2 py-1.5 ${r.profit < 0 ? 'text-danger' : ''}`}>{eur(r.profit)}</td>
              <td className={`px-2 py-1.5 ${r.cumulativeProfit < 0 ? 'text-danger' : ''}`}>{eur(r.cumulativeProfit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Liniendiagramm (eine Achse, € je Monat) mit Fadenkreuz und Tooltip. */
function LineChart({ rows }: { rows: SimMonth[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = 260;
  const pad = { l: 64, r: 16, t: 12, b: 28 };
  const values = rows.flatMap((r) => [r.gross, r.net, r.profit]);
  const maxV = Math.max(10, ...values);
  const minV = Math.min(0, ...values);
  const nice = (v: number) => {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, Math.abs(v)))));
    return Math.ceil(v / p) * p;
  };
  const top = nice(maxV * 1.05);
  const bottom = minV < 0 ? -nice(-minV * 1.05) : 0;
  const iw = Math.max(10, w - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (rows.length <= 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
  const y = (v: number) => pad.t + ((top - v) / (top - bottom)) * ih;
  const ticks = Array.from({ length: 5 }, (_, i) => bottom + ((top - bottom) * i) / 4);
  const path = (k: 'gross' | 'net' | 'profit') => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
  const every = Math.ceil(rows.length / 12);
  const h = hover === null ? null : rows[hover];

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      <svg
        width={w}
        height={H}
        role="img"
        aria-label="Brutto, Netto und Gewinn je Monat"
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - box.left - pad.l) / iw) * (rows.length - 1));
          setHover(Math.max(0, Math.min(rows.length - 1, i)));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={Math.abs(t) < 1e-9 ? 'var(--zero)' : 'var(--grid)'} strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-[var(--ss-text-muted,currentColor)] text-[11px]" opacity={0.7}>
              {eur(t)}
            </text>
          </g>
        ))}
        {bottom < 0 && <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke="var(--zero)" strokeWidth={1} />}
        {rows.map((r, i) =>
          i % every === 0 || i === rows.length - 1 ? (
            <text key={r.month} x={x(i)} y={H - 8} textAnchor="middle" className="text-[11px]" fill="currentColor" opacity={0.6}>
              {r.month}
            </text>
          ) : null,
        )}
        {SERIES.map((s) => (
          <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {h && (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={pad.t + ih} stroke="var(--zero)" strokeDasharray="3 3" />
            {SERIES.map((s) => (
              <circle key={s.key} cx={x(hover!)} cy={y(h[s.key])} r={4.5} fill={s.color} stroke="var(--ss-bg, #fff)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {h && (
        <div
          className="glass mat-float pointer-events-none absolute top-2 z-10 min-w-[190px] rounded-2xl px-3 py-2 text-[12.5px]"
          style={{ left: Math.min(Math.max(0, x(hover!) + 12), w - 200) }}
        >
          <p className="mb-1 font-semibold">Monat {h.month}</p>
          {SERIES.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-muted">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.label.split(' (')[0]}
              </span>
              <span className="num font-medium">{eur(h[s.key])}</span>
            </p>
          ))}
          <p className="mt-1 text-[11.5px] text-faint">
            {int(h.payers)} Abos · {int(h.users)} Nutzer
          </p>
        </div>
      )}
    </div>
  );
}
