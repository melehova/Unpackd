type QueueItem = { box_id: string; name: string; quantity: number };
const QUEUE_KEY = 'unpackd:offlineQueue';

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
