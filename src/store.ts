// A small key-value cache in IndexedDB for data worth keeping across visits
// (rated sections never change). Every call degrades to "not cached" when
// IndexedDB is unavailable (private mode, blocked storage).

interface Entry<T> {
  value: T
  savedAt: number
}

let database: Promise<IDBDatabase | null> | undefined

function open(): Promise<IDBDatabase | null> {
  database ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open('openboard', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('cache')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return database
}

/** The stored value, if present and younger than `ttl` milliseconds. */
export async function read<T>(key: string, ttl = Infinity): Promise<T | undefined> {
  const db = await open()
  if (!db) return undefined
  return new Promise((resolve) => {
    const request = db.transaction('cache').objectStore('cache').get(key)
    request.onsuccess = () => {
      const entry = request.result as Entry<T> | undefined
      resolve(entry && Date.now() - entry.savedAt <= ttl ? entry.value : undefined)
    }
    request.onerror = () => resolve(undefined)
  })
}

export async function write<T>(key: string, value: T): Promise<void> {
  const db = await open()
  if (!db) return
  return new Promise((resolve) => {
    const tx = db.transaction('cache', 'readwrite')
    tx.objectStore('cache').put({ value, savedAt: Date.now() } satisfies Entry<T>, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

/** Cached for `ttl` milliseconds, else fetched and stored. */
export async function cached<T>(key: string, ttl: number, fetch: () => Promise<T>): Promise<T> {
  const saved = await read<T>(key, ttl)
  if (saved !== undefined) return saved
  const value = await fetch()
  await write(key, value)
  return value
}
