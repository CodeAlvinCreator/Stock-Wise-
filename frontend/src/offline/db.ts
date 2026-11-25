import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { NewCount, NewMovement } from '../api'

// Something saved while offline, waiting to be sent. The id is made on the
// phone, so the server can recognise a replay and never save it twice.
// Items queued before counts could go offline have no kind: they are movements.
export type OutboxItem =
  | { id: string; kind?: 'movement'; body: NewMovement; createdAt: number }
  | { id: string; kind: 'count'; body: NewCount; createdAt: number }

export const db = new Dexie('stockwise') as Dexie & { outbox: Table<OutboxItem, string> }

db.version(1).stores({ outbox: 'id, createdAt' })
