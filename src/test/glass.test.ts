import { describe, expect, it } from 'vitest';
import { clampClarity, clarityLabel, glassFactor } from '../lib/glass';

describe('Durchsichtigkeit der Glasflächen', () => {
  it('Standard (50) entspricht dem bisherigen Material', () => {
    expect(glassFactor(50)).toBe(1);
  });
  it('klar = weniger Füllung, milchig = mehr', () => {
    expect(glassFactor(100)).toBe(0.25);
    expect(glassFactor(0)).toBe(4);
    expect(glassFactor(75)).toBeLessThan(1);
    expect(glassFactor(25)).toBeGreaterThan(1);
  });
  it('begrenzt ungültige Werte', () => {
    expect(clampClarity(150)).toBe(100);
    expect(clampClarity(-3)).toBe(0);
    expect(clampClarity('x')).toBe(50);
    expect(clampClarity(Number.NaN)).toBe(50);
  });
  it('liefert verständliche Bezeichnungen', () => {
    expect(clarityLabel(50)).toBe('Ausgewogen');
    expect(clarityLabel(100)).toBe('Sehr klar');
    expect(clarityLabel(0)).toBe('Sehr milchig');
  });
});
