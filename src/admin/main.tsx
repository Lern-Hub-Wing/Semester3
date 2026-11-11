import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { AdminApp } from './AdminApp';

// Admin-Bereich der App (/app/admin/) – eigene Seite, kein Service Worker, keine Offline-Kopie
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
