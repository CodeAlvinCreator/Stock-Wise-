import { api, ApiError } from '../api'
import type { NewCount, NewMovement } from '../api'
import { db } from './db'
import type { OutboxItem } from './db'

export interface FailedItem {
  item: OutboxItem
  message: string
}

// Tells open screens that the queue changed, so they can refresh the count.
function announceChange() {
  window.dispatchEvent(new Event('outbox-changed'))
}

// Tells open screens that the server refused some queued items, so the
// user sees it instead of the data silently disappearing.
function announceFailures(failed: FailedItem[]) {
  if (failed.length > 0) window.dispatchEvent(new CustomEvent<FailedItem[]>('outbox-failed', { detail: failed }))
}

export async function queueMovement(body: NewMovement): Promise<void> {
  await db.outbox.add({ id: body.id, kind: 'movement', body, createdAt: Date.now() })
  announceChange()
}

export async function queueCount(body: NewCount): Promise<void> {
  await db.outbox.add({ id: body.id, kind: 'count', body, createdAt: Date.now() })
  announceChange()
}

function sendItem(item: OutboxItem): Promise<unknown> {
  return item.kind === 'count' ? api.submitCount(item.body) : api.recordMovement(item.body)
}

// Used when an account is deleted, so its queued items are never sent under someone else's login.
export async function clearOutbox(): Promise<void> {
  await db.outbox.clear()
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
      await sendItem(item)
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
  announceFailures(failed)
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
