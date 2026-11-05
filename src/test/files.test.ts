import { describe, expect, it } from 'vitest';
import { buildStoragePath, checkFile, formatBytes, safeFileName, sniffMatches } from '../lib/files';
import { contrastRatio, initials, isHexColor, normalizeHex, suggestColor } from '../lib/colors';

const MB = 1024 * 1024;

describe('Dateiprüfung', () => {
  it('erlaubt PDF, PNG, JPG und WebP', () => {
    expect(checkFile({ name: 'a.pdf', type: 'application/pdf', size: 100 }, 10 * MB).ok).toBe(true);
    expect(checkFile({ name: 'a.JPEG', type: 'image/jpeg', size: 100 }, 10 * MB).ok).toBe(true);
    expect(checkFile({ name: 'a.webp', type: '', size: 100 }, 10 * MB).ok).toBe(true);
  });
  it('lehnt ausführbare und falsch deklarierte Dateien ab', () => {
    expect(checkFile({ name: 'setup.exe', type: 'application/x-msdownload', size: 100 }, 10 * MB).ok).toBe(false);
    expect(checkFile({ name: 'bild.png', type: 'application/x-sh', size: 100 }, 10 * MB).ok).toBe(false);
    expect(checkFile({ name: 'x.svg', type: 'image/svg+xml', size: 100 }, 10 * MB).ok).toBe(false);
  });
  it('begrenzt die Größe', () => {
    const r = checkFile({ name: 'gross.pdf', type: 'application/pdf', size: 11 * MB }, 10 * MB);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('zu groß');
  });
  it('prüft Magic Numbers', async () => {
    expect(await sniffMatches(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])]), 'application/pdf')).toBe(true);
    expect(await sniffMatches(new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])]), 'application/pdf')).toBe(false);
  });
  it('erzeugt kollisionsfreie, sichere Pfade', () => {
    expect(safeFileName('Übung Kostenrechnung (final).PDF')).toBe('Ubung-Kostenrechnung-final.pdf');
    expect(safeFileName('../../etc/passwd.png')).toBe('etc-passwd.png');
    const a = buildStoragePath('m1', 'id-1', 'zettel.pdf');
    const b = buildStoragePath('m1', 'id-2', 'zettel.pdf');
    expect(a).not.toBe(b);
    expect(a).toBe('m1/id-1/zettel.pdf');
  });
  it('formatiert Größen', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2.5 * MB)).toBe('2,5 MB');
  });
});

describe('Farben', () => {
  it('validiert und normalisiert Hex-Farben', () => {
    expect(isHexColor('#AFC5F5')).toBe(true);
    expect(isHexColor('AFC5F5')).toBe(false);
    expect(normalizeHex('#abc')).toBe('#AABBCC');
  });
  it('Pastellfarben haben genug Kontrast zur dunklen Schrift', () => {
    for (const c of ['#AFC5F5', '#CBB8F5', '#AADCCB', '#F5C6A5', '#F4B9B6', '#E8CB9D', '#A6DED7', '#C9B7F2', '#B4D3F2', '#C3D7AD']) {
      expect(contrastRatio(c, '#1D2533')).toBeGreaterThan(7);
    }
  });
  it('schlägt freie Farben vor und bildet Initialen', () => {
    expect(suggestColor(['#AFC5F5'])).not.toBe('#AFC5F5');
    expect(initials('Person 1')).toBe('P1');
    expect(initials('anna')).toBe('AN');
  });
});
