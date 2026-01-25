import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { byteaToSerialString } from '../lib/nfc';
import ItemCard from '../components/ItemCard';
import NewBoxDrawer from '../components/NewBoxDrawer';
import type { Box, ItemActivity } from '../types';
import { hasBoxId } from '../types';

export default function Home() {
  const [recentBoxes, setRecentBoxes] = useState<Array<Box & { last_item_at: string }>>([]);
  const [allBoxes, setAllBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(true);
  const [errorAll, setErrorAll] = useState<string | null>(null);
  const [newBoxOpen, setNewBoxOpen] = useState(false);

  async function loadRecent() {
    setLoading(true);
    setError(null);
    // Fetch recent items, then derive unique box_ids preserving recency
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('box_id, created_at')
      .returns<ItemActivity[]>()
      .order('created_at', { ascending: false })
      .limit(50);
    if (itemsError) {
      setError(itemsError.message);
      setLoading(false);
      return;
    }
    const unique: Record<string, string> = {};
    for (const it of (items || []).filter(hasBoxId)) {
      if (!unique[it.box_id]) unique[it.box_id] = it.created_at ?? '';
    }
    const ids = Object.keys(unique);
    if (ids.length === 0) {
      setRecentBoxes([]);
      setLoading(false);
      return;
    }
    const { data: boxes, error: boxesError } = await supabase
      .from('boxes')
      .select('*')
      .in('id', ids);
    if (boxesError) {
      setError(boxesError.message);
      setLoading(false);
      return;
    }
    const merged = (boxes || []).map((b: Box) => ({ ...b, last_item_at: unique[b.id] }));
    merged.sort((a, b) => (b.last_item_at.localeCompare(a.last_item_at)));
    setRecentBoxes(merged);
    setLoading(false);
  }

  useEffect(() => {
    loadRecent();
    loadAll();
  }, []);

  // Optional realtime: update on new item inserts
  useEffect(() => {
    const channel = supabase.channel('home-updates');
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'items' }, () => {
        loadRecent();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boxes' }, () => {
        loadAll();
      })
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, []);

  async function loadAll() {
    setLoadingAll(true);
    setErrorAll(null);
    const { data, error } = await supabase
      .from('boxes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setErrorAll(error.message);
      setLoadingAll(false);
      return;
    }
    setAllBoxes(data || []);
    setLoadingAll(false);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Recent Boxes</h1>
        {!navigator.onLine && (
          <div className="text-xs text-yellow-300">Offline: data may be stale.</div>
        )}
      </header>

      {loading && (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="text-sm text-red-300">{error}</div>
      )}

      {!loading && !error && (
        <div className="grid gap-3">
          {recentBoxes.map((b) => (
            <ItemCard key={b.id}>
              <div className="flex items-center justify-between">
                <div>
                  <Link to={`/box/${b.id}`} className="font-semibold hover:underline">{b.label || b.id}</Link>
                  <div className="text-xs opacity-70">Last item at {new Date(b.last_item_at).toLocaleString()}</div>
                  {Array.isArray(b.nfc_serials) && b.nfc_serials.length > 0 && (
                    <div className="mt-1 text-xs opacity-70">
                      <span className="opacity-80">Tags:</span>{' '}
                      <span className="font-mono">{b.nfc_serials.map(byteaToSerialString).join(', ')}</span>
                    </div>
                  )}
                </div>
                <Link to={`/box/${b.id}`} className="inline-flex items-center justify-center text-center h-9 px-3 rounded-md bg-accent text-black text-sm font-semibold">Open</Link>
              </div>
            </ItemCard>
          ))}
          {recentBoxes.length === 0 && (
            <div className="opacity-60">No recent activity yet.</div>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Get Started</h2>
        <div className="opacity-80">Create or open a box like <span className="font-mono">#/box/DEMO-BOX</span>.</div>
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center justify-center text-center h-11 px-4 rounded-lg bg-accent text-black font-semibold"
            onClick={() => setNewBoxOpen(true)}
          >
            New Box
          </button>
        </div>
        <NewBoxDrawer
          open={newBoxOpen}
          onClose={() => setNewBoxOpen(false)}
          onCreated={() => {
            // Refresh lists when a new box is created
            loadAll();
            loadRecent();
          }}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">All Boxes</h2>
        {loadingAll && (
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        )}
        {!loadingAll && errorAll && (
          <div className="text-sm text-red-300">{errorAll}</div>
        )}
        {!loadingAll && !errorAll && (
          <div className="grid gap-3">
            {allBoxes.map((b) => (
              <ItemCard key={b.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <Link to={`/box/${b.id}`} className="font-semibold hover:underline">{b.label || b.id}</Link>
                    <div className="text-xs opacity-70">Created {new Date(b.created_at || '').toLocaleString()}</div>
                    {Array.isArray(b.nfc_serials) && b.nfc_serials.length > 0 && (
                      <div className="mt-1 text-xs opacity-70">
                        <span className="opacity-80">Tags:</span>{' '}
                        <span className="font-mono">{b.nfc_serials.map(byteaToSerialString).join(', ')}</span>
                      </div>
                    )}
                  </div>
                  <Link to={`/box/${b.id}`} className="inline-flex items-center justify-center text-center h-9 px-3 rounded-md bg-accent text-black text-sm font-semibold">Open</Link>
                </div>
              </ItemCard>
            ))}
            {allBoxes.length === 0 && (
              <div className="opacity-60">No boxes yet. Create one by visiting a new box route.</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
