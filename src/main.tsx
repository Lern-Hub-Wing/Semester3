import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App';
import { navigate } from './lib/router';
import { IS_APP } from './lib/edition';
import { earlyRedirect } from './components/layout/MovedScreen';

// Bisherige Seite: umgezogen oder Admin-Adresse → sofort weiter zur App (ohne Zwischenfenster)
const leaving = !IS_APP && earlyRedirect();

if (!leaving)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// Service Worker (PWA) – nur im Produktions-Build
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

// Antippen einer Benachrichtigung bei bereits geöffneter App: zur passenden Stelle wechseln
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ type?: string; hash?: string }>) => {
    if (e.data?.type === 'studyspace:navigate' && typeof e.data.hash === 'string' && e.data.hash.startsWith('#/')) {
      navigate(e.data.hash.slice(1));
    }
  });
}
