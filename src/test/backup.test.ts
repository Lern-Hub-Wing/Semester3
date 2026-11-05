import { describe, expect, it } from 'vitest';
import { buildExport, validateImport } from '../lib/backup';

const M = '11111111-1111-4111-8111-000000000001';
const MOD = '22222222-2222-4222-8222-000000000001';
const E = '55555555-5555-4555-8555-000000000001';
const T = '66666666-6666-4666-8666-000000000001';

function sample() {
  return buildExport(
    {
      members: [{ id: M, name: 'Person 1', color: '#AFC5F5', sort_order: 1, is_active: true, version: 3, created_at: 'x' }],
      modules: [{ id: MOD, name: 'Controlling', color: '#B4D3F2', description: null, sort_order: 1, archived_at: null }],
      module_topics: [],
      exams: [],
      study_entries: [{ id: E, module_id: MOD, topic_id: null, study_date: '2026-12-10', title: 'KST', description: null, sort_order: 1, deleted_at: null }],
      tasks: [{ id: T, study_entry_id: E, title: 'Anbauverfahren', description: null, sort_order: 1, deleted_at: null }],
      task_completions: [{ task_id: T, member_id: M, is_completed: true, completed_at: '2026-12-10T10:00:00Z' }],
      attachments: [],
      app_settings: [{ key: 'app_name', value: 'StudySpace' }],
    },
    { appVersion: '1.0.0', bucket: 'materials', publicBaseUrl: null },
  );
}

describe('Export', () => {
  it('kennzeichnet Dateien als externe Referenzen', () => {
    const e = sample();
    expect(e.format).toBe('studyspace-export');
    expect(e.notes).toContain('NICHT enthalten');
  });
});

describe('Import-Validierung', () => {
  it('akzeptiert einen gültigen Export und entfernt Serverfelder', () => {
    const r = validateImport(JSON.parse(JSON.stringify(sample())));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.counts.task_completions).toBe(1);
    expect(r.rows.members[0]).toEqual({ id: M, name: 'Person 1', color: '#AFC5F5', sort_order: 1, is_active: true });
    expect(r.rows.task_completions[0]).not.toHaveProperty('completed_at');
  });

  it('lehnt fremde Dateien ab', () => {
    expect(validateImport({ hello: 'world' }).ok).toBe(false);
    expect(validateImport(null).ok).toBe(false);
  });

  it('erkennt ungültige Werte und Skript-Längen', () => {
    const bad = sample();
    (bad.tables.members[0] as Record<string, unknown>).color = 'javascript:alert(1)';
    (bad.tables.tasks[0] as Record<string, unknown>).title = 'x'.repeat(500);
    const r = validateImport(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('members[0].color');
  });

  it('erkennt fehlende Referenzen', () => {
    const bad = sample();
    bad.tables.modules = [];
    const r = validateImport(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('unbekanntes Modul');
  });
});
