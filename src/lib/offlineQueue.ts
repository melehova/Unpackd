type QueueItem = { box_id: string; name: string; quantity: number };
const QUEUE_KEY = 'unpackd:offlineQueue';
const PENDING_IMAGE_PREFIX = 'unpackd:pendingImages:';
type PendingImage = string | { dataUrl: string; caption?: string };

export function enqueueAddItem(item: QueueItem) {
  const queue = getQueue();
  queue.push(item);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueue(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueueItem[];
  } catch {
    return [];
  }
}

export async function processQueue(processor: (item: QueueItem) => Promise<void>) {
  const queue = getQueue();
  const remaining: QueueItem[] = [];
  for (const q of queue) {
    try {
      await processor(q);
    } catch {
      remaining.push(q);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}

// Pending box images handling (stores multiple data URLs for later upload)
export function enqueuePendingBoxImage(boxId: string, dataUrl: string, caption?: string) {
  try {
    const key = PENDING_IMAGE_PREFIX + boxId;
    const arr = JSON.parse(localStorage.getItem(key) || '[]') as PendingImage[];
    arr.push(caption ? { dataUrl, caption } : dataUrl);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    // ignore storage errors
  }
}

export function getPendingBoxImages(boxId: string): Array<{ dataUrl: string; caption?: string }> {
  try {
    const key = PENDING_IMAGE_PREFIX + boxId;
    const raw = JSON.parse(localStorage.getItem(key) || '[]') as PendingImage[];
    return raw.map((v) => (typeof v === 'string' ? { dataUrl: v } : v));
  } catch {
    return [] as Array<{ dataUrl: string; caption?: string }>;
  }
}

export function clearPendingBoxImages(boxId: string) {
  try {
    localStorage.removeItem(PENDING_IMAGE_PREFIX + boxId);
  } catch {
    // ignore
  }
}

// Backwards-compat single helpers (deprecated)
export function setPendingBoxImage(boxId: string, dataUrl: string, caption?: string) {
  enqueuePendingBoxImage(boxId, dataUrl, caption);
}
export function getPendingBoxImage(boxId: string): { dataUrl: string; caption?: string } | null {
  const arr = getPendingBoxImages(boxId);
  return arr.length ? arr[0] : null;
}
export function clearPendingBoxImage(boxId: string) {
  clearPendingBoxImages(boxId);
}
