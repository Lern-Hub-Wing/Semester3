/**
 * Gewinn-Simulator für den Admin-Bereich: rechnet aus Abonnenten, Wachstum,
 * Kündigungen, Zahlungswegen, Gebühren, Umsatzsteuer und Kosten einen
 * monatlichen Verlauf (Zahlungsfluss: Semesterpässe zählen im Kaufmonat).
 * Reine Funktion ohne React – getestet in src/test/simulate.test.ts.
 */

export type SimPlan = 'solo_monthly' | 'solo_semester' | 'group_monthly' | 'group_semester';

/** Endkundenpreise inkl. 19 % USt (identisch mit der Datenbank) */
export const SIM_PRICES: Record<SimPlan, number> = { solo_monthly: 2.49, solo_semester: 11.99, group_monthly: 4.99, group_semester: 24.99 };

export interface SimInput {
  months: number;
  /** Bestand zu Beginn */
  start: Record<SimPlan, number>;
  /** Faktor auf den Startbestand („hochskalieren“) */
  scale: number;
  /** neue zahlende Abos pro Monat */
  newPerMonth: number;
  /** Wachstum der Neuzugänge je Monat in % */
  growthPct: number;
  /** Anteil Gruppe an Neuzugängen in % (Rest Solo) */
  groupSharePct: number;
  /** Anteil Semesterpass an Neuzugängen in % (Rest monatlich) */
  semesterSharePct: number;
  /** monatliche Kündigungsrate der Monatsabos in % */
  churnPct: number;
  /** Anteil der Semesterpässe, die nach 6 Monaten erneut gekauft werden, in % */
  semesterRenewPct: number;
  /** Personen je Lerngruppe (inkl. Inhaber) – nur für Nutzerzahlen und variable Kosten */
  membersPerGroup: number;
  /** Zahlungswege in % (Summe 100) */
  webPct: number;
  appStorePct: number;
  playPct: number;
  /** Stripe: % vom Bruttobetrag + fester Betrag je Zahlung (€) */
  stripePct: number;
  stripeFixed: number;
  /** Provision App Store / Google Play in % vom Nettobetrag (Small-Business-Programm: 15 %) */
  storePct: number;
  vatPct: number;
  /** Fixkosten je Monat (€), z. B. Supabase, Apple-Entwicklerkonto anteilig, Domain */
  fixedCosts: number;
  /** variable Kosten je aktivem Nutzer und Monat (€) */
  costPerUser: number;
  /** pauschale Steuer auf positiven Gewinn in % (Schätzung) */
  taxPct: number;
}

export interface SimMonth {
  month: number;
  subscribers: Record<SimPlan, number>;
  /** aktive zahlende Abos (Semesterpass: innerhalb seiner 6 Monate) */
  payers: number;
  users: number;
  transactions: number;
  gross: number;
  vat: number;
  fees: number;
  /** Netto nach USt und Gebühren */
  net: number;
  costs: number;
  tax: number;
  /** Gewinn nach Kosten und Steuern */
  profit: number;
  cumulativeProfit: number;
}

export const DEFAULT_SIM: SimInput = {
  months: 12,
  start: { solo_monthly: 0, solo_semester: 0, group_monthly: 0, group_semester: 0 },
  scale: 1,
  newPerMonth: 20,
  growthPct: 10,
  groupSharePct: 40,
  semesterSharePct: 35,
  churnPct: 6,
  semesterRenewPct: 45,
  membersPerGroup: 5,
  webPct: 60,
  appStorePct: 30,
  playPct: 10,
  stripePct: 1.5,
  stripeFixed: 0.25,
  storePct: 15,
  vatPct: 19,
  fixedCosts: 35,
  costPerUser: 0.02,
  taxPct: 0,
};

const PLANS: SimPlan[] = ['solo_monthly', 'solo_semester', 'group_monthly', 'group_semester'];
const round2 = (n: number) => Math.round(n * 100) / 100;

export function simulate(input: SimInput): SimMonth[] {
  const i = input;
  const channel = Math.max(1, i.webPct + i.appStorePct + i.playPct);
  const web = i.webPct / channel;
  const store = (i.appStorePct + i.playPct) / channel;
  const vatFactor = 1 + i.vatPct / 100;

  // Monatsabos: aktueller Bestand; Semesterpässe: Käufe je Monat (für Laufzeit und Verlängerung)
  const monthly: Record<'solo_monthly' | 'group_monthly', number> = {
    solo_monthly: i.start.solo_monthly * i.scale,
    group_monthly: i.start.group_monthly * i.scale,
  };
  const semesterBuys: Record<'solo_semester' | 'group_semester', number[]> = { solo_semester: [], group_semester: [] };
  let cumulative = 0;
  const out: SimMonth[] = [];

  for (let m = 1; m <= i.months; m++) {
    const fresh = i.newPerMonth * Math.pow(1 + i.growthPct / 100, m - 1);
    const g = i.groupSharePct / 100;
    const s = i.semesterSharePct / 100;
    const newBy: Record<SimPlan, number> = {
      solo_monthly: fresh * (1 - g) * (1 - s),
      solo_semester: fresh * (1 - g) * s,
      group_monthly: fresh * g * (1 - s),
      group_semester: fresh * g * s,
    };
    // Monatsabos: Kündigungen ab Monat 2, dann Neuzugänge
    for (const p of ['solo_monthly', 'group_monthly'] as const) {
      monthly[p] = (m === 1 ? monthly[p] : monthly[p] * (1 - i.churnPct / 100)) + newBy[p];
    }
    // Semesterpässe: Startbestand kauft in Monat 1, Verlängerung nach 6 Monaten
    for (const p of ['solo_semester', 'group_semester'] as const) {
      const renew = m > 6 ? (semesterBuys[p][m - 7] ?? 0) * (i.semesterRenewPct / 100) : 0;
      semesterBuys[p][m - 1] = (m === 1 ? i.start[p] * i.scale : 0) + newBy[p] + renew;
    }
    const activeSemester = (p: 'solo_semester' | 'group_semester') => semesterBuys[p].slice(Math.max(0, m - 6), m).reduce((a, b) => a + b, 0);
    const subscribers: Record<SimPlan, number> = {
      solo_monthly: monthly.solo_monthly,
      group_monthly: monthly.group_monthly,
      solo_semester: activeSemester('solo_semester'),
      group_semester: activeSemester('group_semester'),
    };
    const buysNow: Record<SimPlan, number> = {
      solo_monthly: monthly.solo_monthly,
      group_monthly: monthly.group_monthly,
      solo_semester: semesterBuys.solo_semester[m - 1],
      group_semester: semesterBuys.group_semester[m - 1],
    };
    const gross = PLANS.reduce((a, p) => a + buysNow[p] * SIM_PRICES[p], 0);
    const transactions = PLANS.reduce((a, p) => a + buysNow[p], 0);
    const netOfVat = gross / vatFactor;
    const vat = gross - netOfVat;
    const fees = web * (gross * (i.stripePct / 100) + transactions * i.stripeFixed) + store * netOfVat * (i.storePct / 100);
    const net = gross - vat - fees;
    const groups = subscribers.group_monthly + subscribers.group_semester;
    const users = subscribers.solo_monthly + subscribers.solo_semester + groups * i.membersPerGroup;
    const costs = i.fixedCosts + users * i.costPerUser;
    const before = net - costs;
    const tax = Math.max(0, before) * (i.taxPct / 100);
    const profit = before - tax;
    cumulative += profit;
    out.push({
      month: m,
      subscribers,
      payers: PLANS.reduce((a, p) => a + subscribers[p], 0),
      users,
      transactions,
      gross: round2(gross),
      vat: round2(vat),
      fees: round2(fees),
      net: round2(net),
      costs: round2(costs),
      tax: round2(tax),
      profit: round2(profit),
      cumulativeProfit: round2(cumulative),
    });
  }
  return out;
}

export function totals(rows: SimMonth[]) {
  const sum = (k: keyof Pick<SimMonth, 'gross' | 'vat' | 'fees' | 'net' | 'costs' | 'tax' | 'profit'>) => round2(rows.reduce((a, r) => a + r[k], 0));
  const breakEven = rows.find((r) => r.cumulativeProfit > 0)?.month ?? null;
  return { gross: sum('gross'), vat: sum('vat'), fees: sum('fees'), net: sum('net'), costs: sum('costs'), tax: sum('tax'), profit: sum('profit'), breakEven };
}
