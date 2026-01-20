import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

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
