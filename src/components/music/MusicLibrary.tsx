import { useEffect, useMemo, useState } from 'react';
import { CloudOff, Ellipsis, Headphones, LayoutGrid, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { AMBIENCE_LABEL, type AmbienceKind } from '../../lib/ambience';
import { MUSIC_CATEGORIES, categoryLabel, parseYouTube, thumbnailUrl, type MusicCategory } from '../../lib/youtube';
import { haptic } from '../../lib/haptics';
import { addTrack, loadMusic, removeTrack, tracksOf, updateTrack, useMusic, type MusicTrack } from '../../store/music';
import { isCurrent, player, usePlayer } from '../../store/player';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { SelectField, TextField } from '../ui/Field';

type Filter = 'alle' | 'erzeugt' | MusicCategory;

const GENERATED: AmbienceKind[] = ['lofi', 'rain', 'noise'];

/** Musik-Bibliothek: gemeinsame YouTube-Links + erzeugte Klänge (ohne Internet). */
export function MusicLibrary({ compact = false, openAdd = false }: { compact?: boolean; openAdd?: boolean }) {
  const available = useMusic((s) => s.available);
  const all = useMusic((s) => s.tracks);
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const [filter, setFilter] = useState<Filter>('alle');
  const [dialog, setDialog] = useState<{ category: MusicCategory; title: string } | null>(openAdd ? { category: 'lofi', title: '' } : null);
  const [edit, setEdit] = useState<MusicTrack | null>(null);

  useEffect(() => {
    void loadMusic();
  }, []);

  const tracks = useMemo(() => tracksOf(all), [all]);
  const cats: { id: Filter; label: string; count?: number }[] = [
    { id: 'alle', label: 'Alle' },
    ...MUSIC_CATEGORIES.map((c) => ({ id: c.id as Filter, label: c.label, count: tracks.filter((t) => t.category === c.id).length })),
    { id: 'erzeugt', label: 'Ohne Internet' },
  ];

  const playTrack = (t: MusicTrack) => {
    haptic('select');
    if (isCurrent(current, t.id)) player.toggle();
    else player.playTrack(t);
  };
  const playGen = (k: AmbienceKind) => {
    haptic('select');
    if (isCurrent(current, `ambience:${k}`)) player.toggle();
    else player.playAmbience(k);
  };

  const showCats = filter === 'alle' ? MUSIC_CATEGORIES : MUSIC_CATEGORIES.filter((c) => c.id === filter);

  return (
    <div className={`flex min-w-0 flex-col gap-4 ${compact ? '' : 'md:flex-row md:gap-6'}`} data-testid="music-library">
      {/* Kategorien */}
      <nav aria-label="Kategorien" className={compact ? 'no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1' : 'no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 md:mx-0 md:w-[200px] md:shrink-0 md:flex-col md:overflow-visible md:px-0'}>
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            aria-pressed={filter === c.id}
            className={`music-cat shrink-0 ${filter === c.id ? 'music-cat--on' : ''}`}
          >
            {c.id === 'alle' ? <LayoutGrid className="size-4" aria-hidden /> : c.id === 'erzeugt' ? <CloudOff className="size-4" aria-hidden /> : <Headphones className="size-4" aria-hidden />}
            <span className="flex-1 text-left">{c.label}</span>
            {!!c.count && <span className="text-[11.5px] opacity-60">{c.count}</span>}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {available === false && filter !== 'erzeugt' && (
          <p className="rounded-[14px] bg-[color-mix(in_srgb,var(--ss-warn)_12%,transparent)] px-3 py-2.5 text-[13px]" data-testid="music-setup">
            Die gemeinsame Bibliothek ist noch nicht eingerichtet: in Supabase <code>supabase/migrations/007_music.sql</code> ausführen (README, Schritt 14). Die Klänge „Ohne Internet“ funktionieren schon.
          </p>
        )}

        {(filter === 'alle' || filter === 'erzeugt') && (
          <section aria-label="Ohne Internet">
            <h3 className="eyebrow mb-2">Ohne Internet</h3>
            <ul className="flex flex-col gap-1.5">
              {GENERATED.map((k) => {
                const on = isCurrent(current, `ambience:${k}`);
                return (
                  <li key={k}>
                    <TrackRow title={`${AMBIENCE_LABEL[k]} (erzeugt)`} active={on} playing={on && playing} onPlay={() => playGen(k)} thumb={<span className="grid size-full place-items-center bg-[var(--ss-accent-soft)] text-accent"><CloudOff className="size-4" /></span>} />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {available &&
          filter !== 'erzeugt' &&
          showCats.map((c) => {
            const list = tracks.filter((t) => t.category === c.id);
            const empty = Math.max(0, c.slots - list.length);
            if (filter === 'alle' && list.length === 0) return null;
            return (
              <section key={c.id} aria-label={c.label}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="eyebrow">{c.label}</h3>
                  <button type="button" onClick={() => setDialog({ category: c.id, title: `${c.label} ${list.length + 1}` })} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent">
                    <Plus className="size-3.5" aria-hidden /> Link
                  </button>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {list.map((t) => {
                    const on = isCurrent(current, t.id);
                    return (
                      <li key={t.id}>
                        <TrackRow
                          title={t.title}
                          active={on}
                          playing={on && playing}
                          onPlay={() => playTrack(t)}
                          thumb={<Thumb id={t.youtube_id} />}
                          menu={compact ? undefined : <TrackMenu track={t} onEdit={() => setEdit(t)} />}
                        />
                      </li>
                    );
                  })}
                  {filter !== 'alle' &&
                    Array.from({ length: empty }, (_, i) => {
                      const n = list.length + i + 1;
                      return (
                        <li key={`slot-${n}`}>
                          <button type="button" onClick={() => setDialog({ category: c.id, title: `${c.label} ${n}` })} className="music-slot" data-testid="music-slot">
                            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-dashed border-[var(--ss-edge-strong)] text-muted">
                              <Plus className="size-4" aria-hidden />
                            </span>
                            <span className="flex-1 text-left">
                              {c.label} {n}
                            </span>
                            <span className="text-[12.5px] text-accent">Link hinzufügen</span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </section>
            );
          })}

        {available && filter === 'alle' && tracks.length === 0 && (
          <div className="flex flex-col items-start gap-3 rounded-[16px] border border-dashed border-[var(--ss-edge-strong)] p-5">
            <p className="text-[14px]">Noch keine Links in der gemeinsamen Bibliothek.</p>
            <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setDialog({ category: 'lofi', title: 'Lofi 1' })}>
              Ersten Link hinzufügen
            </Button>
          </div>
        )}
      </div>

      {dialog && <AddTrackDialog initial={dialog} onClose={() => setDialog(null)} />}
      {edit && <RenameDialog track={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** Vorschaubild mit ruhigem Platzhalter, falls es nicht geladen werden kann (offline) */
function Thumb({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="grid size-full place-items-center bg-[var(--ss-surface-2)] text-muted">
        <Headphones className="size-4" />
      </span>
    );
  return <img src={thumbnailUrl(id)} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />;
}

function TrackRow({ title, active, playing, onPlay, thumb, menu }: { title: string; active: boolean; playing: boolean; onPlay: () => void; thumb: React.ReactNode; menu?: React.ReactNode }) {
  return (
    <div className={`music-row ${active ? 'music-row--on' : ''}`} data-testid="music-row">
      <span className="relative size-10 shrink-0 overflow-hidden rounded-[10px] bg-[var(--ss-surface-2)]">{thumb}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium" title={title}>
          {title}
        </span>
        <span className="flex items-center gap-2 text-[12px] text-muted">
          <span aria-label="Endlos">∞</span>
          {playing && (
            <span className="eq" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          )}
        </span>
      </span>
      <button type="button" onClick={onPlay} aria-label={playing ? `${title} pausieren` : `${title} abspielen`} className={`grid size-9 shrink-0 place-items-center rounded-full ${active ? 'bg-[var(--ss-accent)] text-[var(--ss-btn-text)]' : 'bg-[var(--ss-surface-2)] text-ink'}`}>
        {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
      </button>
      {menu}
    </div>
  );
}

function TrackMenu({ track, onEdit }: { track: MusicTrack; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" aria-label={`Weitere Aktionen für ${track.title}`} aria-expanded={open} onClick={() => setOpen((v) => !v)} className="grid size-9 place-items-center rounded-full text-muted hover:text-ink">
        <Ellipsis className="size-4" />
      </button>
      {open && (
        <div role="menu" className="mat-float glass absolute right-0 top-10 z-20 w-44 rounded-[14px] p-1.5" onMouseLeave={() => setOpen(false)}>
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13.5px] hover:bg-[var(--ss-surface-2)]" onClick={() => (setOpen(false), onEdit())}>
            <Pencil className="size-4" /> Umbenennen
          </button>
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13.5px] text-danger hover:bg-[var(--ss-surface-2)]" onClick={() => (setOpen(false), void removeTrack(track.id))}>
            <Trash2 className="size-4" /> Entfernen
          </button>
        </div>
      )}
    </div>
  );
}

function AddTrackDialog({ initial, onClose }: { initial: { category: MusicCategory; title: string }; onClose: () => void }) {
  const [category, setCategory] = useState<MusicCategory>(initial.category);
  const [title, setTitle] = useState(initial.title);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = parseYouTube(link);
  const save = async () => {
    if (!title.trim()) return setError('Bitte einen Namen eingeben.');
    if (!parsed) return setError('Bitte einen gültigen YouTube-Link einfügen (z. B. https://youtu.be/…).');
    setBusy(true);
    const ok = await addTrack({ category, title, youtubeId: parsed.id, start: parsed.start });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Link hinzufügen"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()} data-testid="music-save">
            Speichern
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <SelectField label="Kategorie" value={category} onChange={(e) => setCategory(e.target.value as MusicCategory)}>
          {MUSIC_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <TextField label="Name" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="YouTube-Link" value={link} onChange={(e) => (setLink(e.target.value), setError(null))} placeholder="https://www.youtube.com/watch?v=…" inputMode="url" autoFocus />
        {parsed && (
          <div className="flex items-center gap-3 rounded-[14px] bg-[var(--ss-surface-2)] p-2.5">
            <img src={thumbnailUrl(parsed.id)} alt="" className="h-12 w-20 rounded-[8px] object-cover" />
            <span className="text-[13px] text-muted">
              Wird für alle unter „{categoryLabel(category)}“ gespeichert{parsed.start ? ` · Start bei ${Math.floor(parsed.start / 60)}:${String(parsed.start % 60).padStart(2, '0')}` : ''}.
            </span>
          </div>
        )}
        {error && (
          <p role="alert" className="text-[13.5px] font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

function RenameDialog({ track, onClose }: { track: MusicTrack; onClose: () => void }) {
  const [title, setTitle] = useState(track.title);
  return (
    <Modal
      open
      onClose={onClose}
      title="Umbenennen"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={() => void updateTrack(track.id, { title: title.trim() || track.title }).then((ok) => ok && onClose())}>
            Speichern
          </Button>
        </div>
      }
    >
      <TextField label="Name" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus />
    </Modal>
  );
}
