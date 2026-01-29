import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { byteaToSerialString } from '../lib/nfc';
import ItemCard from '../components/ItemCard';
import NewBoxDrawer from '../components/NewBoxDrawer';
import type { Box, ItemActivity } from '../types';
import { hasBoxId } from '../types';
import { searchAll, getSuggestions, addToSearchHistory, indexBoxesForOffline } from '../lib/search';

export default function Home() {
  const [recentBoxes, setRecentBoxes] = useState<Array<Box & { last_item_at: string }>>([]);
  const [allBoxes, setAllBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(true);
  const [errorAll, setErrorAll] = useState<string | null>(null);
  const [newBoxOpen, setNewBoxOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<{
    boxes: Box[];
    items: Array<{ id: string; name: string; quantity: number | null; box_id: string; box_label: string | null }>;
    images: Array<{ id: string; caption: string | null; url: string; box_id: string; box_label: string | null }>;
  }>({ boxes: [], items: [], images: [] });

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
    // Update offline index for search
    indexBoxesForOffline(data || []);
    setLoadingAll(false);
  }

  // Debounced suggestions
  useEffect(() => {
    const t = setTimeout(() => {
      const prefix = searchTerm.trim();
      if (!prefix) {
        setSuggestions([]);
        return;
      }
      setSuggestions(getSuggestions(prefix));
    }, 100);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Execute search with debounce
  useEffect(() => {
    const t = setTimeout(async () => {
      const term = searchTerm.trim();
      if (!term) {
        setResults({ boxes: [], items: [], images: [] });
        setSearchError(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      setSearchError(null);
      try {
        const r = await searchAll(term);
        setResults(r);
        addToSearchHistory(term, r);
      } catch (e: any) {
        setSearchError(e?.message || 'Search failed');
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Recent Boxes</h1>
        <div className="mt-3 flex flex-col gap-2">
          <div className="relative">
            <input
              className="h-11 w-full px-3 rounded-md bg-white/5 border border-white/10 outline-none focus:border-accent"
              placeholder="Search boxes, items, photos…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {suggestions.length > 0 && searchTerm.trim() && !(results.boxes.length || results.items.length || results.images.length) && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-white/10 bg-[#121212] shadow-lg">
                {suggestions.slice(0, 6).map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                    onClick={() => setSearchTerm(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          {searching && (
            <div className="text-xs opacity-70">Searching…</div>
          )}
          {searchError && (
            <div className="text-xs text-red-300">{searchError}</div>
          )}
          {(results.boxes.length || results.items.length || results.images.length) > 0 && (
            <div className="grid gap-3">
              {/* Boxes */}
              {results.boxes.length > 0 && (
                <ItemCard>
                  <div className="space-y-2">
                    <div className="text-sm opacity-70">Boxes</div>
                    <div className="grid gap-2">
                      {results.boxes.slice(0, 5).map((b) => (
                        <div key={b.id} className="flex items-center justify-between">
                          <div>
                            <Link to={`/box/${b.id}`} className="font-semibold hover:underline">{b.label || b.id}</Link>
                          </div>
                          <Link to={`/box/${b.id}`} className="inline-flex items-center justify-center text-center h-8 px-3 rounded-md bg-accent text-black text-sm font-semibold">Open</Link>
                        </div>
                      ))}
                    </div>
                  </div>
                </ItemCard>
              )}
              {/* Items */}
              {results.items.length > 0 && (
                <ItemCard>
                  <div className="space-y-2">
                    <div className="text-sm opacity-70">Items</div>
                    <div className="grid gap-2">
                      {results.items.slice(0, 8).map((it) => (
                        <div key={it.id} className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{it.name}</div>
                            <div className="text-xs opacity-70">in <Link to={`/box/${it.box_id}`} className="hover:underline">{it.box_label || it.box_id}</Link></div>
                          </div>
                          <Link to={`/box/${it.box_id}`} className="inline-flex items-center justify-center text-center h-8 px-3 rounded-md bg-white/5 border border-white/10 text-sm">Open Box</Link>
                        </div>
                      ))}
                    </div>
                  </div>
                </ItemCard>
              )}
              {/* Photos */}
              {results.images.length > 0 && (
                <ItemCard>
                  <div className="space-y-2">
                    <div className="text-sm opacity-70">Photos</div>
                    <div className="grid gap-2">
                      {results.images.slice(0, 8).map((img) => (
                        <div key={img.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <img src={img.url} alt={img.caption ?? 'Photo'} className="h-10 w-10 object-cover rounded-md border border-white/10 bg-white/5" />
                            <div>
                              <div className="font-medium text-sm">{img.caption || extractFileName(img.url)}</div>
                              <div className="text-xs opacity-70">in <Link to={`/box/${img.box_id}`} className="hover:underline">{img.box_label || img.box_id}</Link></div>
                            </div>
                          </div>
                          <Link to={`/box/${img.box_id}`} className="inline-flex items-center justify-center text-center h-8 px-3 rounded-md bg-white/5 border border-white/10 text-sm">Open Box</Link>
                        </div>
                      ))}
                    </div>
                  </div>
                </ItemCard>
              )}
            </div>
          )}
        </div>
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

function extractFileName(url: string) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').pop() || url;
    return last;
  } catch {
    const parts = url.split('?')[0].split('/');
    return parts[parts.length - 1] || url;
  }
}
