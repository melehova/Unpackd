import { useState } from 'react';

export default function DevTools() {
  if (!import.meta.env.DEV) return null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function resetSW() {
    try {
      setBusy(true);
      setMsg(null);
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      setMsg('Service worker and caches cleared. Reloading…');
      setTimeout(() => location.reload(), 300);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to reset service worker.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-3 p-2 rounded-md bg-white/5 border border-white/10 text-sm flex items-center gap-3">
      <span className="opacity-70">Dev Tools:</span>
      <button
        className="inline-flex items-center justify-center text-center h-9 px-3 rounded-md bg-white/10 border border-white/10"
        onClick={resetSW}
        disabled={busy}
      >
        {busy ? 'Resetting…' : 'Reset Service Worker'}
      </button>
      {msg && <span className="text-xs opacity-80">{msg}</span>}
    </div>
  );
}
