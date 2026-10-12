// How many people used OpenBoard in the last 30 days, without tracking anyone.
// The browser asks to be counted at most once per 30 days (see
// src/visitors.ts). The server keeps only a number per day. To stop one
// person inflating the count, it also remembers a salted hash of IP and
// browser for today only; the salt is random, kept in D1, and deleted with
// the hashes the next day, so a hash can never be traced back or linked
// across days.

export const createTables = [
  'CREATE TABLE IF NOT EXISTS visitors_daily (day TEXT PRIMARY KEY, count INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS visitors_seen (day TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (day, hash))',
  'CREATE TABLE IF NOT EXISTS visitors_salt (day TEXT PRIMARY KEY, salt TEXT NOT NULL)',
]

/** The UTC day, like 2026-10-12. */
export const utcDay = (d: Date) => d.toISOString().slice(0, 10)

/** Hex SHA-256 of `parts`, joined with a separator they can't contain. */
export async function hashOf(...parts: string[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('\n')))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Counts this visitor for today, unless they were already counted today. */
export async function countVisit(db: D1Database, ip: string, userAgent: string, now = new Date()): Promise<void> {
  const day = utcDay(now)
  await db.batch([
    ...createTables.map((sql) => db.prepare(sql)),
    // Forget yesterday's hashes and salt.
    db.prepare('DELETE FROM visitors_seen WHERE day < ?').bind(day),
    db.prepare('DELETE FROM visitors_salt WHERE day < ?').bind(day),
    db.prepare('INSERT OR IGNORE INTO visitors_salt (day, salt) VALUES (?, ?)').bind(day, crypto.randomUUID()),
  ])
  const salt = await db.prepare('SELECT salt FROM visitors_salt WHERE day = ?').bind(day).first<string>('salt')
  const hash = await hashOf(salt ?? '', ip, userAgent)
  const seen = await db.prepare('INSERT OR IGNORE INTO visitors_seen (day, hash) VALUES (?, ?)').bind(day, hash).run()
  if (seen.meta.changes === 0) return
  await db
    .prepare('INSERT INTO visitors_daily (day, count) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET count = count + 1')
    .bind(day)
    .run()
}

/** People counted over the last 30 days, today included. */
export async function visitorsLast30Days(db: D1Database, now = new Date()): Promise<number> {
  const since = utcDay(new Date(now.getTime() - 29 * 86_400_000))
  try {
    return (await db.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM visitors_daily WHERE day >= ?').bind(since).first<number>('n')) ?? 0
  } catch {
    // No visits yet, so no table yet.
    return 0
  }
}
