import { useEffect, useState } from 'react';

// Minimal type for the non-standard event
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Platform checks: mobile and standalone
    const ua = navigator.userAgent || '';
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone === true;
    setIsMobile(mobile);
    setIsStandalone(standalone);

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setDeferred(null);
      setInfo(null);
      setDismissed(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // Attempt programmatic prompt on first user gesture (required by browsers).
  useEffect(() => {
    if (!deferred || dismissed || !isMobile || isStandalone) return;
    let triggered = false;
    const handler = async () => {
      if (triggered) return;
      triggered = true;
      try {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
        setInfo('Install prompt shown. If it didn’t appear, use your browser menu to Install or Add to Home Screen.');
      } catch {
        setInfo('Use your browser menu to Install or Add to Home Screen.');
      } finally {
        cleanup();
      }
    };
    function cleanup() {
      window.removeEventListener('click', handler);
      window.removeEventListener('touchstart', handler);
      window.removeEventListener('keydown', handler);
    }
    window.addEventListener('click', handler, { once: true } as any);
    window.addEventListener('touchstart', handler, { once: true } as any);
    window.addEventListener('keydown', handler, { once: true } as any);
    return cleanup;
  }, [deferred, dismissed]);

  if (dismissed || isStandalone || !isMobile) return null;

  async function handleInstall() {
    try {
      if (deferred) {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
        setInfo('If the install prompt did not appear, use your browser menu to Install or Add to Home Screen.');
      } else {
        setInfo('Use your browser menu to Install or Add to Home Screen.');
      }
    } catch {
      setInfo('Use your browser menu to Install or Add to Home Screen.');
    }
  }

  return (
    <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="font-medium">Install Unpackd</div>
          {info && <div className="opacity-80">{info}</div>}
        </div>
        {deferred && (
          <button
            className="inline-flex items-center justify-center text-center h-9 px-3 rounded-md bg-accent text-black font-semibold"
            onClick={handleInstall}
          >
            Install
          </button>
        )}
        <button
          className="inline-flex items-center justify-center text-center h-9 px-3 rounded-md bg-white/10"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
