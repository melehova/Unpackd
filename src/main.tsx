import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';
import { registerSW } from 'virtual:pwa-register';

window.addEventListener('load', () => {
  const ua = navigator.userAgent;
  const info = { href: location.href, protocol: location.protocol, secure: (window as any).isSecureContext };
  console.log('[PWA] Context info:', info, ua);
  try {
    registerSW({
      immediate: true,
      onRegisteredSW(swUrl, reg) {
        console.log('[PWA] Service worker registered:', swUrl, reg);
      },
      onRegisterError(error) {
        console.warn('[PWA] Service worker registration failed:', error);
      },
    });
  } catch (e) {
    console.warn('[PWA] Service worker registration threw:', e);
  }
});

function OnlineSync() {
  useEffect(() => {
    const handler = () => {
      window.dispatchEvent(new Event('unpackd:online'));
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, []);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <OnlineSync />
      <App />
    </HashRouter>
  </StrictMode>
);
