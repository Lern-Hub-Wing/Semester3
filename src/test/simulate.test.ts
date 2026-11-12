import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM, simulate, totals } from '../admin/simulate';

const base = { ...DEFAULT_SIM, newPerMonth: 0, growthPct: 0, churnPct: 0, fixedCosts: 0, costPerUser: 0, taxPct: 0 };

describe('Gewinn-Simulator', () => {
  it('ohne Abos kein Umsatz, Fixkosten ergeben Verlust', () => {
    const rows = simulate({ ...base, fixedCosts: 30 });
    expect(rows).toHaveLength(12);
    expect(rows[0].gross).toBe(0);
    expect(rows[11].cumulativeProfit).toBe(-360);
    expect(totals(rows).breakEven).toBeNull();
  });

  it('Brutto → USt → Gebühren → Netto für 100 Solo-Monatsabos über das Web', () => {
    const [m1] = simulate({ ...base, months: 1, start: { ...base.start, solo_monthly: 100 }, webPct: 100, appStorePct: 0, playPct: 0 });
    expect(m1.gross).toBe(249);
    expect(m1.vat).toBeCloseTo(249 - 249 / 1.19, 2);
    // Stripe 1,5 % + 0,25 € je Zahlung
    expect(m1.fees).toBeCloseTo(249 * 0.015 + 100 * 0.25, 2);
    expect(m1.net).toBeCloseTo(m1.gross - m1.vat - m1.fees, 1); // Rundung je Posten
  });

  it('App-Store-Provision auf den Nettobetrag', () => {
    const [m1] = simulate({ ...base, months: 1, start: { ...base.start, group_monthly: 10 }, webPct: 0, appStorePct: 100, playPct: 0 });
    expect(m1.fees).toBeCloseTo((49.9 / 1.19) * 0.15, 2);
  });

  it('Semesterpass zählt im Kaufmonat und 6 Monate als aktiv; Verlängerung nach 6 Monaten', () => {
    const rows = simulate({ ...base, months: 8, start: { ...base.start, group_semester: 10 }, semesterRenewPct: 50 });
    expect(rows[0].gross).toBeCloseTo(249.9, 2);
    expect(rows[1].gross).toBe(0);
    expect(rows[5].subscribers.group_semester).toBe(10);
    expect(rows[6].gross).toBeCloseTo(124.95, 2);
    expect(rows[6].subscribers.group_semester).toBe(5);
  });

  it('Skalierung, Kündigungen und Nutzer je Gruppe', () => {
    const rows = simulate({ ...base, months: 2, start: { ...base.start, group_monthly: 2 }, scale: 10, churnPct: 10, membersPerGroup: 6 });
    expect(rows[0].subscribers.group_monthly).toBe(20);
    expect(rows[0].users).toBe(120);
    expect(rows[1].subscribers.group_monthly).toBeCloseTo(18, 5);
  });

  it('Steuer nur auf positiven Gewinn', () => {
    const [m1] = simulate({ ...base, months: 1, start: { ...base.start, solo_monthly: 1000 }, taxPct: 30, webPct: 100, appStorePct: 0, playPct: 0 });
    const before = m1.net - m1.costs;
    expect(m1.tax).toBeCloseTo(before * 0.3, 1);
    expect(totals([m1]).breakEven).toBe(1);
  });
});
