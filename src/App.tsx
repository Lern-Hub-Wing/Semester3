import { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { config } from './lib/config';
import { EASE_OUT } from './lib/motion';
import { matchPath, navigate, useLocation } from './lib/router';
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
import { HomeworkEditor } from './components/homework/HomeworkEditor';
import { MiniPlayer } from './components/music/MiniPlayer';
import { MoveTaskDialog } from './components/MoveTaskDialog';
import { SearchPalette } from './components/SearchPalette';
import { AttachmentPreview } from './components/Attachments';
import { CelebrationWatcher } from './components/Celebration';
import type { Member } from './lib/types';
import { installSpotlight } from './lib/spotlight';
import { FocusWatcher } from './components/FocusTimer';
import { MountainFlight } from './components/landscape/MountainFlight';
import { rememberReturnPath, returnPath } from './lib/focusReturn';
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
const Materials = lazy(() => import('./pages/Materials').then((m) => ({ default: m.Materials })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Trash = lazy(() => import('./pages/Trash').then((m) => ({ default: m.Trash })));
const Activity = lazy(() => import('./pages/Activity').then((m) => ({ default: m.Activity })));
const loadFocus = () => import('./pages/Focus');
const FocusLazy = lazy(() => loadFocus().then((m) => ({ default: m.Focus })));
/** Vorab geladene Fokusansicht – wird dann direkt (ohne Suspense-Verzögerung) gezeigt */
let FocusReady: (typeof import('./pages/Focus'))['Focus'] | null = null;
function preloadFocus() {
  void loadFocus().then((m) => {
    FocusReady = m.Focus;
  });
}
function FocusView() {
  if (FocusReady) return <FocusReady />;
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#0b0c1c]" />}>
      <FocusLazy />
    </Suspense>
  );
}
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })));
const Music = lazy(() => import('./pages/Music').then((m) => ({ default: m.Music })));
const Homework = lazy(() => import('./pages/Homework').then((m) => ({ default: m.Homework })));
const StudyMode = lazy(() => import('./pages/StudyMode').then((m) => ({ default: m.StudyMode })));

function RedirectTo({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

function Routes({ me, path }: { me: Member; path: string }) {
  let p: Record<string, string> | null;
  if (path === '/' || path === '') return <Dashboard me={me} />;
  if (path === '/lernplan') return <Plan me={me} />;
  if (path === '/faecher') return <Modules me={me} />;
  if ((p = matchPath('/faecher/:id', path))) return <ModuleDetail id={p.id} me={me} />;
  if (path === '/team') return <Team me={me} />;
  if ((p = matchPath('/team/:id', path))) return <MemberDetail id={p.id} me={me} />;
  // Prüfungen gehören seit 4.1 zu den Fächern – alte Links führen dorthin
  if (path === '/pruefungen') return <RedirectTo to="/faecher" />;
  if (path === '/materialien') return <Materials />;
  if (path === '/einstellungen') return <Settings />;
  if ((p = matchPath('/einstellungen/:section', path))) return <Settings section={p.section} />;
  if (path === '/hausaufgaben') return <Homework me={me} />;
  if (path === '/musik') return <Music />;
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

  const isFocus = path === '/fokus' || path === '/fokus/vollbild';

  // Letzte Seite merken: „Fokus schließen“ führt dorthin zurück
  useEffect(() => rememberReturnPath(path), [path]);

  // Fokus-Ansicht vorab laden, damit sie beim Antippen ohne Wartezeit erscheint
  useEffect(() => {
    const t = setTimeout(preloadFocus, 1200);
    return () => clearTimeout(t);
  }, []);

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
        ) : path === '/lernmodus' ? (
          // Lernmodus: Vollbild ohne App-Rahmen
          <Suspense key="study" fallback={<div className="fixed inset-0 bg-[#0C1018]" />}>
            <StudyMode />
          </Suspense>
        ) : (
          <AppShell key="app" inert={isFocus}>
            <Suspense fallback={<PageSkeleton />}>
              {/* Unter dem Fokus bleibt die vorige Seite stehen */}
              <Routes me={me} path={isFocus ? returnPath() : path} />
            </Suspense>
          </AppShell>
        )}
      </AnimatePresence>
      {/* Fokus: eigene Ebene über der App – öffnet sofort im Vollbild, ohne erst die Seite zu wechseln */}
      <AnimatePresence>
        {me && me.is_active && isFocus && (
          <motion.div
            key="focus"
            className="fixed inset-0 z-50"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          >
            <FocusView />
          </motion.div>
        )}
      </AnimatePresence>
      <MountainFlight />
      {me && <CelebrationWatcher />}
      {me && <FocusWatcher />}
      {me && me.is_active && <PushOnboarding me={me} />}
      {me && me.is_active && <PushMemberSwitch me={me} members={members} />}
      {me && <BadgeSync me={me} />}
      <EntryEditor />
      {me && <HomeworkEditor />}
      {me && <MiniPlayer />}
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
