import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { MovementType } from '../api'

// A movement waiting to be sent. The id is made on the phone, so the server
// can recognise a replay and never count the same movement twice.
export interface QueuedMovement {
  id: string
  product_id: string
  movement_type: MovementType
  quantity: number
  note?: string
}

export interface OutboxItem {
  id: string
  body: QueuedMovement
  createdAt: number
}

export const db = new Dexie('stockwise') as Dexie & { outbox: Table<OutboxItem, string> }

db.version(1).stores({ outbox: 'id, createdAt' })
