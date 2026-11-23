import { api, ApiError } from '../api'
import { db } from './db'
import type { OutboxItem, QueuedMovement } from './db'

export interface FailedItem {
  item: OutboxItem
  message: string
}

// Tells open screens that the queue changed, so they can refresh the count.
function announceChange() {
  window.dispatchEvent(new Event('outbox-changed'))
}

export async function queueMovement(body: QueuedMovement): Promise<void> {
  await db.outbox.add({ id: body.id, body, createdAt: Date.now() })
  announceChange()
}

export function countOutbox(): Promise<number> {
  return db.outbox.count()
}

async function sendQueued(): Promise<FailedItem[]> {
  const failed: FailedItem[] = []
  const items = await db.outbox.orderBy('createdAt').toArray()

  for (const item of items) {
    try {
      await api.recordMovement(item.body)
      await db.outbox.delete(item.id)
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      // Rejected by the server (bad data): drop it and report it.
      // 401 is kept, because an expired login must not lose the movement.
      if (status >= 400 && status < 500 && status !== 401) {
        await db.outbox.delete(item.id)
        failed.push({ item, message: (err as Error).message })
        continue
      }
      // No network, server down or logged out: keep everything and stop,
      // so the order is preserved for the next try.
      break
    }
  }

  announceChange()
  return failed
}

// Only one flush at a time, so two "online" events can't send an item twice.
let running: Promise<FailedItem[]> | null = null

export function flushOutbox(): Promise<FailedItem[]> {
  if (!running) {
    running = sendQueued().finally(() => {
      running = null
    })
  }
  return running
}

// Call once when the app starts.
export function startOutboxSync(): void {
  void flushOutbox()
  window.addEventListener('online', () => void flushOutbox())
}
