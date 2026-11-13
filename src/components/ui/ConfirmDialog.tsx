import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { TextField } from './Field';

/**
 * Einheitliche Bestätigung für alle Aktionen mit Folgen (entfernen, löschen,
 * kündigen …): Titel, kurzer Text, „Abbrechen“ links, Aktion rechts. Mit
 * `typed` muss vorher ein Wort/Name abgetippt werden (endgültige Löschungen).
 */
export function ConfirmDialog({
  open, onClose, title, children, confirmLabel, onConfirm, tone = 'danger', typed, typedLabel, busy, testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: (typed: string) => void;
  tone?: 'danger' | 'primary';
  typed?: string;
  typedLabel?: string;
  busy?: boolean;
  testId?: string;
}) {
  const [value, setValue] = useState('');
  useEffect(() => setValue(''), [open]);
  const ok = !typed || value.trim().toLowerCase() === typed.trim().toLowerCase();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant={tone} disabled={!ok} loading={busy} onClick={() => onConfirm(value.trim())} data-testid={testId ?? 'confirm-dialog'}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[14px]">
        <div className="leading-relaxed text-muted">{children}</div>
        {typed !== undefined && (
          <TextField label={typedLabel ?? `Zur Bestätigung „${typed}“ eingeben`} value={value} onChange={(e) => setValue(e.target.value)} placeholder={typed} autoComplete="off" />
        )}
      </div>
    </Modal>
  );
}
