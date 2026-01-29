import { supabase } from './supabase';
import type { Box, Item, BoxImage } from '../types';

const HISTORY_KEY = 'unpackd:searchHistory';
const INDEX_BOXES_KEY = 'unpackd:index:boxes';

export function indexBoxesForOffline(boxes: Box[]) {
  try {
    const compact = boxes.map((b) => ({ id: b.id, label: b.label ?? null }));
    localStorage.setItem(INDEX_BOXES_KEY, JSON.stringify(compact));
  } catch {}
}

export function getSuggestions(prefix: string): string[] {
  const p = prefix.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  try {
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as string[];
    for (const h of hist) {
      if (h.toLowerCase().startsWith(p) && !seen.has(h)) {
        out.push(h);
        seen.add(h);
      }
    }
  } catch {}
  try {
    const boxes = JSON.parse(localStorage.getItem(INDEX_BOXES_KEY) || '[]') as Array<{ id: string; label: string | null }>;
    for (const b of boxes) {
      const label = b.label || b.id;
      if (label.toLowerCase().startsWith(p) && !seen.has(label)) {
        out.push(label);
        seen.add(label);
      }
    }
  } catch {}
  return out.slice(0, 10);
}

export async function searchAll(term: string): Promise<{
  boxes: Box[];
  items: Array<{ id: string; name: string; quantity: number | null; box_id: string; box_label: string | null }>;
  images: Array<{ id: string; caption: string | null; url: string; box_id: string; box_label: string | null }>;
}> {
  const q = term.trim();
  if (!q) return { boxes: [], items: [], images: [] };

  if (!navigator.onLine) {
    // Offline: search in local boxes index only
    try {
      const boxes = JSON.parse(localStorage.getItem(INDEX_BOXES_KEY) || '[]') as Array<{ id: string; label: string | null }>;
      const p = q.toLowerCase();
      const filtered = boxes.filter((b) => (b.label || b.id).toLowerCase().includes(p)).map((b) => ({ id: b.id, label: b.label, created_at: '', nfc_serials: null } as unknown as Box));
      return { boxes: filtered, items: [], images: [] };
    } catch {}
    return { boxes: [], items: [], images: [] };
  }

  // Online: query Supabase across tables
  const boxesPromise = supabase
    .from('boxes')
    .select('*')
    .or(`label.ilike.%${escapeLike(q)}%,id.ilike.%${escapeLike(q)}%`)
    .limit(10);

  const itemsPromise = supabase
    .from('items')
    .select('id,name,quantity,box_id')
    .ilike('name', `%${escapeLike(q)}%`)
    .limit(15);

  const imagesPromise = supabase
    .from('box_images')
    .select('id,caption,url,box_id')
    .or(`caption.ilike.%${escapeLike(q)}%,url.ilike.%${escapeLike(q)}%`)
    .limit(15);

  const [{ data: boxesData }, { data: itemsData }, { data: imagesData }] = await Promise.all([boxesPromise, itemsPromise, imagesPromise]);

  const boxesMap = new Map<string, Box>();
  for (const b of (boxesData || []) as Box[]) boxesMap.set(b.id, b);

  // Attach box labels to items/images
  const items = ((itemsData || []) as Item[]).map((it) => ({
    id: it.id,
    name: it.name,
    quantity: it.quantity ?? 1,
    box_id: it.box_id as string,
    box_label: boxesMap.get((it.box_id as string))?.label ?? null,
  }));

  // For images, enrich with box label; if missing, fetch labels for remaining box_ids
  const imagesRaw = ((imagesData || []) as BoxImage[]);
  const missingBoxIds = imagesRaw.map((i) => i.box_id).filter((bid) => !boxesMap.has(bid));
  const uniqueMissing = Array.from(new Set(missingBoxIds)).slice(0, 20);
  if (uniqueMissing.length) {
    const { data: moreBoxes } = await supabase.from('boxes').select('id,label').in('id', uniqueMissing);
    for (const b of (moreBoxes || []) as Box[]) boxesMap.set(b.id, b);
  }
  const images = imagesRaw.map((img) => ({
    id: img.id,
    caption: img.caption ?? null,
    url: img.url,
    box_id: img.box_id,
    box_label: boxesMap.get(img.box_id)?.label ?? null,
  }));

  return {
    boxes: (boxesData || []) as Box[],
    items,
    images,
  };
}

export function addToSearchHistory(term: string, result?: { boxes?: any[]; items?: any[]; images?: any[] }) {
  try {
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as string[];
    const sanitized = term.trim();
    const next = [sanitized, ...hist.filter((h) => h !== sanitized)].slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {}
}

function escapeLike(v: string) {
  // Escape % and _ for ILIKE patterns
  return v.replace(/[%_]/g, (m) => `\\${m}`);
}
