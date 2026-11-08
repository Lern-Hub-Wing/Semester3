import { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig } from 'motion/react';
import { config } from './lib/config';
import { EASE_OUT } from './lib/motion';
import { matchPath, useLocation } from './lib/router';
import { useAppearance } from './hooks/useAppearance';
import { useData } from './store/data';
import { installResumePrompt, useSession } from './store/session';
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
import { installSpotlight } from './lib/spotlight';
import { FocusWatcher } from './components/FocusTimer';
import { PushMemberSwitch, PushOnboarding } from './components/PushOnboarding';
import { BadgeSync } from './components/BadgeSync';
import { initPush } from './store/push';
import { useActiveMembers, useCurrentMember } from './store/derived';

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
const Focus = lazy(() => import('./pages/Focus').then((m) => ({ default: m.Focus })));
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })));
const FocusImmersive = lazy(() => import('./pages/FocusImmersive').then((m) => ({ default: m.FocusImmersive })));
const StudyMode = lazy(() => import('./pages/StudyMode').then((m) => ({ default: m.StudyMode })));

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
  if (path === '/einstellungen/benachrichtigungen') return <Settings section="benachrichtigungen" />;
  if (path === '/fokus') return <Focus me={me} />;
  if (path === '/analyse') return <Analytics me={me} />;
  if (path === '/papierkorb') return <Trash />;
  if (path === '/verlauf') return <Activity />;
  return <Dashboard me={me} />;
}

function Main() {
  const { path } = useLocation();
  const me = useCurrentMember();
  const phase = useData((s) => s.phase);
  const select = useSession((s) => s.select);
  const activeId = useSession((s) => s.activeMemberId);
  const members = useActiveMembers();

  useEffect(() => {
    startSync();
    installResumePrompt();
    installSpotlight();
    void initPush();
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
        ) : path === '/fokus/vollbild' ? (
          <Suspense key="focus-full" fallback={<div className="fixed inset-0 bg-[#0b0c1c]" />}>
            <FocusImmersive />
          </Suspense>
        ) : path === '/lernmodus' ? (
          // Lernmodus: Vollbild ohne App-Rahmen
          <Suspense key="study" fallback={<div className="fixed inset-0 bg-[#0C1018]" />}>
            <StudyMode />
          </Suspense>
        ) : (
          <AppShell key="app">
            <Suspense fallback={<PageSkeleton />}>
              <Routes me={me} />
            </Suspense>
          </AppShell>
        )}
      </AnimatePresence>
      {me && <CelebrationWatcher />}
      {me && <FocusWatcher />}
      {me && me.is_active && <PushOnboarding me={me} />}
      {me && me.is_active && <PushMemberSwitch me={me} members={members} />}
      {me && <BadgeSync me={me} />}
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
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'} transition={{ ease: EASE_OUT }}>
      {config.isConfigured && !config.usesForbiddenKey ? <Main /> : <Setup />}
      <Toasts />
    </MotionConfig>
  );
}
