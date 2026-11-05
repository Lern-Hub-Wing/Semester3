import { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig } from 'motion/react';
import { config } from './lib/config';
import { matchPath, useLocation } from './lib/router';
import { useAppearance } from './hooks/useAppearance';
import { useData } from './store/data';
import { useCurrentMember } from './store/derived';
import { useSession } from './store/session';
import { startSync } from './store/sync';
import { AppShell } from './components/layout/AppShell';
import { Toasts } from './components/ui/Toasts';
import { PageSkeleton } from './components/ui/Skeleton';
import { ProfilePicker } from './pages/ProfilePicker';
import { Dashboard } from './pages/Dashboard';
import { Setup } from './pages/Setup';
import { EntryEditor } from './components/EntryEditor';
import { MoveTaskDialog } from './components/MoveTaskDialog';
import { SearchPalette } from './components/SearchPalette';
import { AttachmentPreview } from './components/Attachments';
import { CelebrationWatcher } from './components/Celebration';
import type { Member } from './lib/types';

// Seltener genutzte Seiten werden erst bei Bedarf geladen (kleineres Start-Bundle).
const Plan = lazy(() => import('./pages/Plan').then((m) => ({ default: m.Plan })));
const Modules = lazy(() => import('./pages/Modules').then((m) => ({ default: m.Modules })));
const ModuleDetail = lazy(() => import('./pages/Modules').then((m) => ({ default: m.ModuleDetail })));
const Team = lazy(() => import('./pages/Team').then((m) => ({ default: m.Team })));
const MemberDetail = lazy(() => import('./pages/Team').then((m) => ({ default: m.MemberDetail })));
const Exams = lazy(() => import('./pages/Exams').then((m) => ({ default: m.Exams })));
const Materials = lazy(() => import('./pages/Materials').then((m) => ({ default: m.Materials })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Trash = lazy(() => import('./pages/Trash').then((m) => ({ default: m.Trash })));
const Activity = lazy(() => import('./pages/Activity').then((m) => ({ default: m.Activity })));

function Routes({ me }: { me: Member }) {
  const { path } = useLocation();
  let p: Record<string, string> | null;
  if (path === '/' || path === '') return <Dashboard me={me} />;
  if (path === '/lernplan') return <Plan me={me} />;
  if (path === '/faecher') return <Modules me={me} />;
  if ((p = matchPath('/faecher/:id', path))) return <ModuleDetail id={p.id} me={me} />;
  if (path === '/team') return <Team me={me} />;
  if ((p = matchPath('/team/:id', path))) return <MemberDetail id={p.id} me={me} />;
  if (path === '/pruefungen') return <Exams />;
  if (path === '/materialien') return <Materials />;
  if (path === '/einstellungen') return <Settings />;
  if (path === '/papierkorb') return <Trash />;
  if (path === '/verlauf') return <Activity />;
  return <Dashboard me={me} />;
}

function Main() {
  const me = useCurrentMember();
  const phase = useData((s) => s.phase);
  const select = useSession((s) => s.select);
  const activeId = useSession((s) => s.activeMemberId);

  useEffect(() => {
    startSync();
  }, []);

  // Gewähltes Profil wurde deaktiviert oder existiert nicht mehr → zurück zur Auswahl
  useEffect(() => {
    if (phase === 'ready' && activeId && (!me || !me.is_active)) select(null);
  }, [phase, activeId, me, select]);

  return (
    <LayoutGroup>
      <AnimatePresence mode="wait">
        {!me || !me.is_active ? (
          <ProfilePicker key="picker" />
        ) : (
          <AppShell key="app">
            <Suspense fallback={<PageSkeleton />}>
              <Routes me={me} />
            </Suspense>
          </AppShell>
        )}
      </AnimatePresence>
      {me && <CelebrationWatcher />}
      <EntryEditor />
      <MoveTaskDialog />
      <SearchPalette />
      <AttachmentPreview />
    </LayoutGroup>
  );
}

export default function App() {
  const { reducedMotion } = useAppearance();
  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'} transition={{ ease: [0.22, 1, 0.36, 1] }}>
      {config.isConfigured && !config.usesForbiddenKey ? <Main /> : <Setup />}
      <Toasts />
    </MotionConfig>
  );
}
