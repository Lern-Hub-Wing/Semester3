import { describe, expect, it } from 'vitest';
import { DEFAULT_STUDY_MODE, clockParts, sanitizeStudyMode } from '../lib/studyMode';

describe('Lernmodus: Uhrzeit', () => {
  const d = new Date(2026, 10, 5, 21, 7, 9);
  it('zeigt HH:MM:SS sekundengenau', () => {
    expect(clockParts(d, { format: 'hms', hour12: false })).toEqual({ hours: '21', minutes: '07', seconds: '09', period: null });
  });
  it('zeigt nur HH:MM, wenn gewünscht', () => {
    expect(clockParts(d, { format: 'hm', hour12: false }).seconds).toBeNull();
  });
  it('unterstützt das 12-Stunden-Format', () => {
    expect(clockParts(d, { format: 'hm', hour12: true })).toMatchObject({ hours: '9', period: 'PM' });
    expect(clockParts(new Date(2026, 0, 1, 0, 5), { format: 'hm', hour12: true })).toMatchObject({ hours: '12', period: 'AM' });
    expect(clockParts(new Date(2026, 0, 1, 7, 5), { format: 'hm', hour12: false }).hours).toBe('07');
  });
});

describe('Lernmodus: Einstellungen', () => {
  it('liefert Standards bei leeren oder kaputten Daten', () => {
    expect(sanitizeStudyMode(null)).toEqual(DEFAULT_STUDY_MODE);
    expect(sanitizeStudyMode('x')).toEqual(DEFAULT_STUDY_MODE);
  });
  it('ersetzt ungültige Werte', () => {
    const s = sanitizeStudyMode({ format: 'abc', color: 'red', size: 500, font: 'comic', background: 'video', gradient: ['#123456'] });
    expect(s.format).toBe('hms');
    expect(s.color).toBe(DEFAULT_STUDY_MODE.color);
    expect(s.size).toBe(100);
    expect(s.font).toBe('inter');
    expect(s.background).toBe('aurora');
    expect(s.gradient[0]).toBe('#123456');
  });
  it('begrenzt die Schriftstärke auf die Möglichkeiten der Schrift', () => {
    expect(sanitizeStudyMode({ font: 'serif', weight: 100 }).weight).toBe(400);
    expect(sanitizeStudyMode({ font: 'thin', weight: 900 }).weight).toBe(500);
  });
  it('übernimmt gültige Werte', () => {
    const s = sanitizeStudyMode({ format: 'hm', hour12: true, font: 'digital', weight: 700, color: '#aadccb', background: 'image', imageDim: 50 });
    expect(s).toMatchObject({ format: 'hm', hour12: true, font: 'digital', weight: 700, color: '#AADCCB', background: 'image', imageDim: 50 });
  });
});
