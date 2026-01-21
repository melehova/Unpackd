import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ItemCard from '../components/ItemCard';
import { supabase } from '../lib/supabase';
import { enqueueAddItem, processQueue } from '../lib/offlineQueue';
import type { Box as BoxType, Item } from '../types';
import type { TablesInsert } from '../../supabase/Supabase API';

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
    const [sortKey, setSortKey] = useState<'name' | 'created_at'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    useEffect(() => {
        let ignore = false;
        async function load() {
            setLoading(true);
            const { data: boxes, error } = await supabase
                .from('boxes')
                .select('*')
                .eq('id', boxId)
                .limit(1)
                .returns<BoxType[]>();
            if (ignore) return;
            if (error) {
                console.error(error);
            }
            const boxData = boxes && boxes[0] ? boxes[0] : null;
            setBox(boxData);
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
        const { data } = await supabase
            .from('items')
            .select('*')
            .eq('box_id', boxId)
            .returns<Item[]>();
        setItems(data || []);
    }

    const sortedItems = useMemo(() => {
        const copy = [...items];
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortKey === 'name') {
            copy.sort((a, b) => ((a.name ?? '').localeCompare(b.name ?? '')) * dir);
        } else {
            const aTime = (v: Item) => (v.created_at ? Date.parse(v.created_at) : 0);
            copy.sort((a, b) => (aTime(a) - aTime(b)) * dir);
        }
        return copy;
    }, [items, sortKey, sortDir]);

    useEffect(() => {
        if (!boxId) return;
        const channel = supabase.channel('box-updates');
        channel
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'items', filter: `box_id=eq.${boxId}` },
                (payload: any) => {
                    const event = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
                    function isItemRow(v: any): v is Item {
                        return v && typeof v.id === 'string' && typeof v.box_id === 'string' && typeof v.name === 'string';
                    }
                    if (event === 'INSERT' && isItemRow(payload.new)) {
                        const inserted = payload.new;
                        setItems((prev) => {
                            const exists = prev.some((it) => it.id === inserted.id);
                            return exists ? prev.map((it) => (it.id === inserted.id ? inserted : it)) : [...prev, inserted];
                        });
                    } else if (event === 'UPDATE' && isItemRow(payload.new)) {
                        const updated = payload.new;
                        setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
                    } else if (event === 'DELETE' && isItemRow(payload.old)) {
                        const removed = payload.old;
                        setItems((prev) => prev.filter((it) => it.id !== removed.id));
                    }
                }
            )
            .subscribe();

        return () => {
            try {
                supabase.removeChannel(channel);
            } catch { }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boxId]);

    async function initializeBox() {
        setCreating(true);
        const boxPayload: TablesInsert<'boxes'> = { id: boxId, label: `Box ${boxId}`, nfc_id: boxId };
        const { data, error } = await supabase
            .from('boxes')
            .insert(boxPayload)
            .select('*')
            .returns<BoxType[]>();
        if (error) {
            console.error(error);
        } else {
            const inserted = data && data[0] ? data[0] : null;
            setBox(inserted);
            await fetchItems();
        }
        setCreating(false);
    }

    async function addItem() {
        const payload: TablesInsert<'items'> = { box_id: boxId, name: newItem.name.trim(), quantity: newItem.quantity };
        if (!payload.name) return;
        setAddError(null);
        setNetworkWarning(null);
        if (navigator.onLine) {
            setAdding(true);
            const tempId = `_temp_${Date.now()}`;
            const tempItem: Item = { id: tempId, box_id: boxId, name: payload.name, quantity: payload.quantity ?? 1, created_at: new Date().toISOString() } as Item;
            setItems((prev) => [...prev, tempItem]);
            try {
                const { data, error } = await supabase
                    .from('items')
                    .insert(payload)
                    .select('*')
                    .returns<Item[]>();
                if (error) {
                    // rollback optimistic item and queue
                    setItems((prev) => prev.filter((it) => it.id !== tempId));
                    const queuePayload = { box_id: boxId, name: payload.name, quantity: payload.quantity ?? 1 };
                    enqueueAddItem(queuePayload);
                    setNetworkWarning('Network issue: item queued and will sync when online.');
                } else {
                    const inserted = data && data[0] ? data[0] : undefined;
                    if (inserted) {
                        setItems((prev) => prev.map((it) => (it.id === tempId ? inserted : it)));
                    } else {
                        // fallback: refetch to reconcile
                        await fetchItems();
                    }
                }
            } catch (e: any) {
                setItems((prev) => prev.filter((it) => it.id !== tempId));
                const queuePayload = { box_id: boxId, name: payload.name, quantity: payload.quantity ?? 1 };
                enqueueAddItem(queuePayload);
                setNetworkWarning('Network issue: item queued and will sync when online.');
                setAddError(e?.message || 'Failed to add item.');
            } finally {
                setAdding(false);
                setNewItem({ name: '', quantity: 1 });
            }
        } else {
            const queuePayload = { box_id: boxId, name: payload.name, quantity: payload.quantity ?? 1 };
            enqueueAddItem(queuePayload);
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

            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Items</h2>
                    <div className="flex items-center gap-2">
                        <label className="text-sm opacity-70">Sort</label>
                        <select
                            className="h-9 px-2 rounded-md bg-white/5 border border-white/10 text-sm"
                            value={sortKey}
                            onChange={(e) => setSortKey(e.target.value as 'name' | 'created_at')}
                        >
                            <option value="name">Name</option>
                            <option value="created_at">Created</option>
                        </select>
                        <button
                            className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm"
                            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                            aria-label="Toggle sort direction"
                        >
                            {sortDir === 'asc' ? 'Asc' : 'Desc'}
                        </button>
                    </div>
                </div>
                <div className="grid gap-3">
                    {sortedItems.map((it) => (
                        <ItemCard key={it.id}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium">{it.name}</div>
                                    <div className="text-xs opacity-70">Added {it.created_at ? new Date(it.created_at).toLocaleString() : '—'}</div>
                                </div>
                                <div className="text-sm opacity-70">x{it.quantity ?? 1}</div>
                            </div>
                        </ItemCard>
                    ))}
                    {sortedItems.length === 0 && (
                        <div className="opacity-60">No items yet.</div>
                    )}
                </div>
            </section>


        </div>
    );
}
