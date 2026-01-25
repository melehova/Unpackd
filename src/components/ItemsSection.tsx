import { useEffect, useMemo, useState } from 'react';
import ItemCard from './ItemCard';
import { supabase } from '../lib/supabase';
import { enqueueAddItem, processQueue } from '../lib/offlineQueue';
import type { Item } from '../types';
import type { TablesInsert, TablesUpdate } from '../../supabase/Supabase API';

type Props = {
  boxId: string;
};

export default function ItemsSection({ boxId }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [newItem, setNewItem] = useState<{ name: string; quantity: string }>({ name: '', quantity: '1' });
  const [adding, setAdding] = useState(false);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'name' | 'created_at'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; quantity: string }>({ name: '', quantity: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listEditMode, setListEditMode] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function loadItems() {
      const { data } = await supabase
        .from('items')
        .select('*')
        .eq('box_id', boxId)
        .returns<Item[]>();
      if (!ignore) setItems(data || []);
    }
    loadItems();
    return () => { ignore = true; };
  }, [boxId]);

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
    const channel = supabase.channel('box-items-updates');
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
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [boxId]);

  useEffect(() => {
    async function onOnline() {
      await processQueue(async (q) => {
        await supabase.from('items').insert(q);
      });
      const { data } = await supabase
        .from('items')
        .select('*')
        .eq('box_id', boxId)
        .returns<Item[]>();
      setItems(data || []);
    }
    window.addEventListener('unpackd:online', onOnline);
    return () => window.removeEventListener('unpackd:online', onOnline);
  }, [boxId]);

  async function addItem() {
    const name = newItem.name.trim();
    const qtyStr = (newItem.quantity ?? '').toString().trim();
    const qtyNum = Number(qtyStr);
    const qtyIsInt = Number.isInteger(qtyNum);
    if (!name) return;
    if (!qtyStr || !isFinite(qtyNum) || !qtyIsInt || qtyNum < 1) {
      setAddError('Quantity must be a positive integer (≥ 1).');
      return;
    }
    const payload: TablesInsert<'items'> = { box_id: boxId, name, quantity: qtyNum };
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
          setItems((prev) => prev.filter((it) => it.id !== tempId));
          const queuePayload = { box_id: boxId, name: payload.name, quantity: payload.quantity ?? 1 };
          enqueueAddItem(queuePayload);
          setNetworkWarning('Network issue: item queued and will sync when online.');
        } else {
          const inserted = data && data[0] ? data[0] : undefined;
          if (inserted) {
            setItems((prev) => prev.map((it) => (it.id === tempId ? inserted : it)));
          } else {
            const { data: refetched } = await supabase
              .from('items')
              .select('*')
              .eq('box_id', boxId)
              .returns<Item[]>();
            setItems(refetched || []);
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
        setNewItem({ name: '', quantity: '1' });
      }
    } else {
      const queuePayload = { box_id: boxId, name: payload.name, quantity: payload.quantity ?? 1 };
      enqueueAddItem(queuePayload);
      setNewItem({ name: '', quantity: '1' });
    }
  }

  function startEdit(it: Item) {
    setEditingId(it.id);
    setEditForm({ name: it.name ?? '', quantity: String(it.quantity ?? 1) });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: '', quantity: '' });
    setEditError(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    const name = editForm.name.trim();
    const qtyStr = (editForm.quantity ?? '').toString().trim();
    const qtyNum = Number(qtyStr);
    const qtyIsInt = Number.isInteger(qtyNum);
    if (!name) {
      setEditError('Name is required.');
      return;
    }
    if (!qtyStr || !isFinite(qtyNum) || !qtyIsInt || qtyNum < 1) {
      setEditError('Quantity must be a positive integer (≥ 1).');
      return;
    }
    if (!navigator.onLine) {
      setEditError('Editing items requires an online connection.');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    const prev = items;
    const optimistic = items.map((it) => (it.id === editingId ? { ...it, name, quantity: qtyNum } : it));
    setItems(optimistic);
    const payload: TablesUpdate<'items'> = { name, quantity: qtyNum };
    try {
      const { data, error } = await supabase
        .from('items')
        .update(payload)
        .eq('id', editingId)
        .select('*')
        .returns<Item[]>();
      if (error) {
        setItems(prev);
        setEditError(error.message);
        return;
      }
      const updated = data && data[0] ? data[0] : undefined;
      if (updated) {
        setItems((current) => current.map((it) => (it.id === updated.id ? updated : it)));
      }
      setEditingId(null);
      setEditForm({ name: '', quantity: '' });
    } catch (e: any) {
      setItems(prev);
      setEditError(e?.message || 'Failed to update item.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteItem(id: string) {
    if (!navigator.onLine) {
      setAddError('Deleting items requires an online connection.');
      return;
    }
    setDeletingId(id);
    const prev = items;
    setItems((curr) => curr.filter((it) => it.id !== id));
    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', id);
      if (error) {
        setItems(prev);
        setAddError(error.message);
      }
    } catch (e: any) {
      setItems(prev);
      setAddError(e?.message || 'Failed to delete item.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
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
                className="h-11 w-24 px-3 rounded-md bg-white/5 border border-white/10 outline-none focus:border-accent"
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                inputMode="numeric"
                placeholder="1"
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
              <div className="text-xs text-yellow-300">{networkWarning}</div>
            )}
            {addError && (
              <div className="text-xs text-red-300">{addError}</div>
            )}
            {!navigator.onLine && (
              <div className="text-xs opacity-70">Offline: item queued and will sync when online.</div>
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
            <div className="w-px h-6 bg-white/10 mx-1" />
            <button
              className={`h-9 px-3 rounded-md text-sm ${listEditMode ? 'bg-accent text-black' : 'bg-white/5 border border-white/10'}`}
              onClick={() => {
                setListEditMode((prev) => {
                  const next = !prev;
                  if (!next) {
                    cancelEdit();
                  }
                  return next;
                });
              }}
              aria-pressed={listEditMode}
            >
              {listEditMode ? 'Done' : 'Edit List'}
            </button>
          </div>
        </div>
        <div className="grid gap-3">
          {sortedItems.map((it) => (
            <ItemCard key={it.id}>
              {listEditMode && editingId === it.id ? (
                <div className="flex items-center gap-3">
                  <input
                    className="h-9 flex-1 px-3 rounded-md bg-white/5 border border-white/10 text-sm outline-none focus:border-accent"
                    placeholder="Item name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    className="h-9 w-24 px-3 rounded-md bg-white/5 border border-white/10 text-sm outline-none focus:border-accent"
                    placeholder="1"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                  />
                  <button
                    className="h-9 px-3 rounded-md bg-accent text-black text-sm font-semibold disabled:opacity-50"
                    onClick={saveEdit}
                    disabled={savingEdit}
                  >
                    {savingEdit ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm"
                    onClick={cancelEdit}
                    disabled={savingEdit}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs opacity-70">Added {it.created_at ? new Date(it.created_at).toLocaleString() : '—'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm opacity-70">x{it.quantity ?? 1}</div>
                    {listEditMode && (
                      <>
                        <button
                          className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm"
                          onClick={() => startEdit(it)}
                        >
                          Edit
                        </button>
                        <button
                          className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm text-red-300 disabled:opacity-50"
                          onClick={() => deleteItem(it.id)}
                          disabled={deletingId === it.id}
                        >
                          {deletingId === it.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {editError && listEditMode && editingId === it.id && (
                <div className="mt-2 text-xs text-red-300">{editError}</div>
              )}
            </ItemCard>
          ))}
          {sortedItems.length === 0 && (
            <div className="opacity-60">No items yet.</div>
          )}
        </div>
      </section>
    </>
  );
}
