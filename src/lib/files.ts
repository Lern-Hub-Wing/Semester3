import { ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, config } from './config';

export type FileCheck = { ok: true; mime: string } | { ok: false; reason: string };

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/** Prüft Endung, MIME-Typ und Größe. (Der Storage prüft serverseitig zusätzlich.) */
export function checkFile(file: { name: string; type: string; size: number }, maxBytes = config.maxUploadBytes): FileCheck {
  const ext = extensionOf(file.name);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, reason: `„${file.name}“: Dateityp nicht erlaubt. Erlaubt sind PDF, PNG, JPG und WebP.` };
  }
  const expected = EXT_TO_MIME[ext];
  const mime = file.type || expected;
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mime) || mime !== expected) {
    return { ok: false, reason: `„${file.name}“: Dateiinhalt passt nicht zur Endung.` };
  }
  if (file.size <= 0) return { ok: false, reason: `„${file.name}“ ist leer.` };
  if (file.size > maxBytes) {
    return { ok: false, reason: `„${file.name}“ ist zu groß (${formatBytes(file.size)}). Maximal ${formatBytes(maxBytes)}.` };
  }
  return { ok: true, mime };
}

/** Prüft die ersten Bytes der Datei (Magic Numbers), damit z. B. umbenannte Programme abgelehnt werden. */
export async function sniffMatches(file: Blob, mime: string): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  switch (mime) {
    case 'application/pdf':
      return starts(0x25, 0x50, 0x44, 0x46); // %PDF
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47);
    case 'image/jpeg':
      return starts(0xff, 0xd8, 0xff);
    case 'image/webp':
      return starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
    default:
      return false;
  }
}

/** Sicherer Dateiname für den Storage-Pfad (Original bleibt in den Metadaten). */
export function safeFileName(name: string): string {
  const ext = extensionOf(name);
  const base = name
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${base || 'datei'}.${ext}`;
}

/** Eindeutiger, kollisionsfreier Pfad: <modul>/<uuid>/<name> */
export function buildStoragePath(moduleId: string | null, fileId: string, name: string): string {
  return `${moduleId ?? 'allgemein'}/${fileId}/${safeFileName(name)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`;
}

export function fileTypeLabel(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return 'PDF';
    case 'image/png':
      return 'PNG';
    case 'image/jpeg':
      return 'JPG';
    case 'image/webp':
      return 'WebP';
    default:
      return 'Datei';
  }
}

export const isImage = (mime: string) => mime.startsWith('image/');
