import { useMemo, useRef, useState, type DragEvent } from 'react';
import { motion } from 'motion/react';
import { Download, ExternalLink, FileText, ImageIcon, Trash2, Upload } from 'lucide-react';
import type { Attachment, AttachmentTarget } from '../lib/types';
import { config } from '../lib/config';
import { fileTypeLabel, formatBytes, isImage } from '../lib/files';
import { publicFileUrl } from '../lib/supabase';
import { formatInstant } from '../lib/time';
import { useData } from '../store/data';
import { deleteAttachment, uploadFile, type UploadTarget } from '../store/actions';
import { useUI } from '../store/ui';
import { useIsMobile } from '../hooks/useMediaQuery';
import { Button } from './ui/Button';
import { Menu } from './ui/Menu';
import { Modal } from './ui/Modal';

export function useAttachments(filter: (a: Attachment) => boolean, deps: unknown[]) {
  const all = useData((s) => s.attachments);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Object.values(all).filter((a) => !a.deleted_at && filter(a)).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)), [all, ...deps]);
}

/** Uploadbereich: Drag & Drop am Desktop, großer Button auf dem Smartphone. */
export function FileDrop({ target, disabled, onUploaded }: { target: UploadTarget | null; disabled?: boolean; onUploaded?: () => void }) {
  const mobile = useIsMobile();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(0);

  const handle = async (files: FileList | File[] | null) => {
    if (!files || !target) return;
    const list = [...files];
    setBusy((b) => b + list.length);
    for (const f of list) {
      await uploadFile(f, target);
      setBusy((b) => b - 1);
    }
    onUploaded?.();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) void handle(e.dataTransfer.files);
  };

  const inputEl = (
    <input
      ref={input}
      type="file"
      className="sr-only"
      tabIndex={-1}
      multiple
      accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
      onChange={(e) => {
        void handle(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (mobile) {
    return (
      <div>
        {inputEl}
        <Button variant="primary" size="lg" className="w-full" icon={<Upload className="size-5" />} loading={busy > 0} disabled={disabled || !target} onClick={() => input.current?.click()}>
          {busy > 0 ? `Lade ${busy} Datei${busy > 1 ? 'en' : ''} hoch …` : 'Datei hinzufügen'}
        </Button>
        <p className="mt-2 text-center text-xs text-faint">PDF, PNG, JPG oder WebP · max. {formatBytes(config.maxUploadBytes)}</p>
      </div>
    );
  }

  return (
    <motion.div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      animate={{ scale: over ? 1.01 : 1 }}
      className={`relative flex flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed px-6 py-8 text-center transition-colors ${
        over ? 'border-accent bg-[color-mix(in_srgb,var(--ss-accent)_10%,transparent)]' : 'border-line bg-[color-mix(in_srgb,var(--ss-text)_3%,transparent)]'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {inputEl}
      <span className="grid size-12 place-items-center rounded-2xl bg-surface text-accent shadow-sm">
        <Upload className="size-5" aria-hidden />
      </span>
      <p className="font-medium">{busy > 0 ? `Lade ${busy} Datei${busy > 1 ? 'en' : ''} hoch …` : 'Dateien hierher ziehen'}</p>
      <p className="text-sm text-muted">
        oder{' '}
        <button type="button" disabled={disabled || !target} className="font-medium text-accent hover:underline" onClick={() => input.current?.click()}>
          vom Gerät auswählen
        </button>
      </p>
      <p className="text-xs text-faint">PDF, PNG, JPG oder WebP · max. {formatBytes(config.maxUploadBytes)} pro Datei</p>
    </motion.div>
  );
}

/** Liste der Anhänge eines Ziels (Modul, Thema, Lerntag oder Aufgabe). */
export function AttachmentList({ targetType, targetId, compact }: { targetType: AttachmentTarget; targetId: string; compact?: boolean }) {
  const items = useAttachments((a) => a.target_type === targetType && a.target_id === targetId, [targetType, targetId]);
  if (!items.length) return null;
  return (
    <ul className={`flex flex-wrap gap-2 ${compact ? 'mt-2' : 'mt-3'}`}>
      {items.map((a) => (
        <li key={a.id}>
          <AttachmentChip attachment={a} />
        </li>
      ))}
    </ul>
  );
}

export function AttachmentChip({ attachment }: { attachment: Attachment }) {
  const setUI = useUI((s) => s.set);
  return (
    <button
      type="button"
      onClick={() => setUI({ previewId: attachment.id })}
      className="flex max-w-[240px] items-center gap-2 rounded-xl border border-line bg-[color-mix(in_srgb,var(--ss-text)_4.5%,transparent)] px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]"
    >
      {isImage(attachment.mime_type) ? <ImageIcon className="size-4 shrink-0 text-muted" aria-hidden /> : <FileText className="size-4 shrink-0 text-muted" aria-hidden />}
      <span className="truncate font-medium">{attachment.original_filename}</span>
    </button>
  );
}

/** Karte für die Materialübersicht. */
export function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const module = useData((s) => (attachment.module_id ? s.modules[attachment.module_id] : undefined));
  const setUI = useUI((s) => s.set);
  const url = publicFileUrl(attachment.storage_path);
  const image = isImage(attachment.mime_type);
  return (
    <article className="card lift group relative flex flex-col overflow-hidden rounded-[var(--radius-card)]">
      <button type="button" onClick={() => setUI({ previewId: attachment.id })} className="relative block aspect-[4/3] w-full overflow-hidden bg-[color-mix(in_srgb,var(--ss-text)_5%,transparent)]" aria-label={`Vorschau von ${attachment.original_filename}`}>
        {image ? (
          <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <span className="grid size-full place-items-center">
            <span className="flex flex-col items-center gap-2 text-muted">
              <FileText className="size-10" style={{ color: module?.color }} aria-hidden />
              <span className="text-xs font-semibold tracking-wide">PDF</span>
            </span>
          </span>
        )}
        {module && <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ background: module.color }} />}
      </button>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={attachment.original_filename}>
            {attachment.original_filename}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {fileTypeLabel(attachment.mime_type)} · {formatBytes(attachment.file_size)} · {formatInstant(attachment.uploaded_at, { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          {module && <p className="mt-0.5 truncate text-xs text-faint">{module.name}</p>}
        </div>
        <Menu
          items={[
            { label: 'Öffnen', icon: <ExternalLink />, onSelect: () => window.open(url, '_blank', 'noopener') },
            { label: 'In den Papierkorb', icon: <Trash2 />, danger: true, onSelect: () => void deleteAttachment(attachment.id) },
          ]}
        />
      </div>
    </article>
  );
}

/** Globale Vorschau (Bild-Lightbox oder PDF-Ansicht). */
export function AttachmentPreview() {
  const id = useUI((s) => s.previewId);
  const setUI = useUI((s) => s.set);
  const attachment = useData((s) => (id ? s.attachments[id] : undefined));
  const module = useData((s) => (attachment?.module_id ? s.modules[attachment.module_id] : undefined));
  const mobile = useIsMobile();
  const close = () => setUI({ previewId: null });
  const url = attachment ? publicFileUrl(attachment.storage_path) : '';
  const download = attachment ? `${url}?download=${encodeURIComponent(attachment.original_filename)}` : '';

  return (
    <Modal
      open={!!attachment}
      onClose={close}
      title={attachment?.original_filename ?? ''}
      description={attachment ? `${fileTypeLabel(attachment.mime_type)} · ${formatBytes(attachment.file_size)}${module ? ` · ${module.name}` : ''}` : undefined}
      wide
      footer={
        attachment && (
          <>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => {
                void deleteAttachment(attachment.id);
                close();
              }}
            >
              Papierkorb
            </Button>
            <a href={download} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-line bg-[color-mix(in_srgb,var(--ss-text)_5%,transparent)] px-4 text-sm font-medium">
              <Download className="size-4" aria-hidden /> Herunterladen
            </a>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-ink px-4 text-sm font-medium text-canvas">
              <ExternalLink className="size-4" aria-hidden /> Öffnen
            </a>
          </>
        )
      }
    >
      {attachment &&
        (isImage(attachment.mime_type) ? (
          <img src={url} alt={attachment.original_filename} className="mx-auto max-h-[65dvh] w-auto rounded-2xl object-contain" />
        ) : mobile ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <FileText className="size-12 text-muted" aria-hidden />
            <p className="text-sm text-muted">PDF-Dokumente öffnen sich auf dem Smartphone im Dokumentbetrachter des Geräts.</p>
          </div>
        ) : (
          <iframe title={attachment.original_filename} src={url} className="h-[65dvh] w-full rounded-2xl border border-line bg-white" />
        ))}
    </Modal>
  );
}
