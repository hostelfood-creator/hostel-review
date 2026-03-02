/**
 * Offline complaint queue using IndexedDB.
 * Caches unsent complaints when the user is offline and auto-submits
 * them when connectivity is restored.
 */

const DB_NAME = 'hostel_review_offline'
const DB_VERSION = 1
const STORE_NAME = 'pending_complaints'

export interface PendingComplaint {
  id?: number
  complaintText: string
  category: string
  createdAt: string
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Save a complaint to the offline queue */
export async function queueComplaint(complaint: Omit<PendingComplaint, 'id' | 'createdAt'>): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add({
      ...complaint,
      createdAt: new Date().toISOString(),
    })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Get all pending complaints */
export async function getPendingComplaints(): Promise<PendingComplaint[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Remove a complaint from the queue after successful submission */
export async function removePendingComplaint(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Get count of pending complaints */
export async function getPendingCount(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).count()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Attempt to flush all queued complaints to the server.
 * Returns the number of successfully submitted complaints.
 */
export async function flushPendingComplaints(): Promise<number> {
  const pending = await getPendingComplaints()
  let submitted = 0

  for (const complaint of pending) {
    try {
      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintText: complaint.complaintText,
          category: complaint.category,
        }),
      })
      if (res.ok && complaint.id) {
        await removePendingComplaint(complaint.id)
        submitted++
      }
    } catch {
      // Still offline — stop trying
      break
    }
  }

  return submitted
}
