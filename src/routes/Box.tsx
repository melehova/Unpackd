import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ItemCard from '../components/ItemCard';
import { supabase } from '../lib/supabase';
import { enqueueAddItem, processQueue } from '../lib/offlineQueue';
import type { Box as BoxType, Item } from '../types';

export default function Box() {
  const { id } = useParams();
  const boxId = id || '';
  const [box, setBox] = useState<BoxType | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', quantity: 1 });
  const [adding, setAdding] = useState(false);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      const { data: boxData, error } = await supabase
        .from('boxes')
        .select('*')
        .eq('id', boxId)
        .maybeSingle();
      if (ignore) return;
      if (error) {
        console.error(error);
      }
      setBox(boxData ?? null);
      setLoading(false);
      if (boxData) {
        await fetchItems();
      }
    }
    load();
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxId]);

  async function fetchItems() {
    const { data } = await supabase.from('items').select('*').eq('box_id', boxId).order('name');
    setItems(data || []);
  }

  useEffect(() => {
    if (!boxId) return;
    const channel = supabase.channel('box-updates');
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `box_id=eq.${boxId}` },
        (payload: any) => {
          const event = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          if (event === 'INSERT' && payload.new) {
            const inserted = payload.new as Item;
            setItems((prev) => {
              // avoid duplicates if initial fetch already included it
              const exists = prev.some((it) => it.id === inserted.id);
              return exists ? prev.map((it) => (it.id === inserted.id ? inserted : it)) : [...prev, inserted];
            });
          } else if (event === 'UPDATE' && payload.new) {
            const updated = payload.new as Item;
            setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
          } else if (event === 'DELETE' && payload.old) {
            const removed = payload.old as Item;
            setItems((prev) => prev.filter((it) => it.id !== removed.id));
          }
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxId]);

  async function initializeBox() {
    setCreating(true);
    const { data, error } = await supabase.from('boxes').insert({ id: boxId, label: `Box ${boxId}` }).select('*').single();
    if (error) {
      console.error(error);
    } else {
      setBox(data as BoxType);
      await fetchItems();
    }
    setCreating(false);
  }

  async function addItem() {
    const payload = { box_id: boxId, name: newItem.name.trim(), quantity: newItem.quantity };
    if (!payload.name) return;
    setAddError(null);
    setNetworkWarning(null);
    if (navigator.onLine) {
      setAdding(true);
      const tempId = `_temp_${Date.now()}`;
      const tempItem: Item = { id: tempId, box_id: boxId, name: payload.name, quantity: payload.quantity } as Item;
      setItems((prev) => [...prev, tempItem]);
      try {
        const { data, error } = await supabase.from('items').insert(payload).select('*');
        if (error) {
          // rollback optimistic item and queue
          setItems((prev) => prev.filter((it) => it.id !== tempId));
          enqueueAddItem(payload);
          setNetworkWarning('Network issue: item queued and will sync when online.');
        } else {
          const inserted = (data && data[0]) as Item | undefined;
          if (inserted) {
            setItems((prev) => prev.map((it) => (it.id === tempId ? inserted : it)));
          } else {
            // fallback: refetch to reconcile
            await fetchItems();
          }
        }
      } catch (e: any) {
        setItems((prev) => prev.filter((it) => it.id !== tempId));
        enqueueAddItem(payload);
        setNetworkWarning('Network issue: item queued and will sync when online.');
        setAddError(e?.message || 'Failed to add item.');
      } finally {
        setAdding(false);
        setNewItem({ name: '', quantity: 1 });
      }
    } else {
      enqueueAddItem(payload);
      setNewItem({ name: '', quantity: 1 });
    }
  }

  useEffect(() => {
    async function onOnline() {
      await processQueue(async (q) => {
        await supabase.from('items').insert(q);
      });
      await fetchItems();
    }
    window.addEventListener('unpackd:online', onOnline);
    return () => window.removeEventListener('unpackd:online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxId]);

  if (loading) {
    return <div>Loading box...</div>;
  }

  if (!box) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">New Box Found</h1>
        <p className="opacity-80">Initialize box <span className="font-mono">{boxId}</span> in the database.</p>
        <button
          className="h-11 px-4 rounded-lg bg-accent text-black font-semibold disabled:opacity-50"
          onClick={initializeBox}
          disabled={creating}
        >
          {creating ? 'Creating...' : 'Create Box'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{box.label || box.id}</h1>
        <p className="opacity-70 font-mono">{box.id}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Items</h2>
        <div className="grid gap-3">
          {items.map((it) => (
            <ItemCard key={it.id}>
              <div className="flex items-center justify-between">
                <div className="font-medium">{it.name}</div>
                <div className="text-sm opacity-70">x{it.quantity}</div>
              </div>
            </ItemCard>
          ))}
          {items.length === 0 && (
            <div className="opacity-60">No items yet.</div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Add Item</h2>
        <ItemCard>
          <div className="flex flex-col gap-3">
            <input
              className="h-11 px-3 rounded-md bg-white/5 border border-white/10 outline-none focus:border-accent"
              placeholder="Item name"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            />
            <div className="flex items-center gap-3">
              <label className="text-sm opacity-80">Qty</label>
              <input
                type="number"
                min={1}
                className="h-11 w-24 px-3 rounded-md bg-white/5 border border-white/10 outline-none focus:border-accent"
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: Math.max(1, Number(e.target.value || 1)) })}
              />
              <button
                className="ml-auto h-11 px-4 rounded-lg bg-accent text-black font-semibold disabled:opacity-50"
                onClick={addItem}
                disabled={adding}
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
            {networkWarning && (
              <div className="text-xs text-yellow-300">
                {networkWarning}
              </div>
            )}
            {addError && (
              <div className="text-xs text-red-300">
                {addError}
              </div>
            )}
            {!navigator.onLine && (
              <div className="text-xs opacity-70">
                Offline: item queued and will sync when online.
              </div>
            )}
          </div>
        </ItemCard>
      </section>
    </div>
  );
}
