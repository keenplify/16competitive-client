type Entry = { account: string; key: string; savedAt: number; value: unknown }
const MAX_AGE = 24 * 60 * 60 * 1000
const MAX_ENTRIES = 24
const MAX_BYTES = 1024 * 1024

/** Public display data only. Authentication and mutations always use the backend. */
export function createLocalSnapshotCache<T>(
  namespace: string,
  parse: (value: unknown) => T,
  storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => window.localStorage
) {
  const name = `16competitive.snapshot.v1.${namespace}`
  const entries = (): Entry[] => {
    try {
      const raw = storage().getItem(name)
      if (!raw || raw.length > MAX_BYTES) return []
      const value: unknown = JSON.parse(raw)
      if (!Array.isArray(value)) return []
      return value
        .filter(
          (row): row is Entry =>
            row &&
            typeof row === 'object' &&
            typeof row.account === 'string' &&
            typeof row.key === 'string' &&
            typeof row.savedAt === 'number' &&
            Number.isFinite(row.savedAt) &&
            row.savedAt <= Date.now() &&
            Date.now() - row.savedAt < MAX_AGE
        )
        .slice(0, MAX_ENTRIES)
    } catch {
      return []
    }
  }
  const save = (rows: Entry[]): void => {
    try {
      while (rows.length && JSON.stringify(rows).length > MAX_BYTES) rows.pop()
      storage().setItem(name, JSON.stringify(rows))
    } catch {
      /* A full or disabled cache must not interrupt the live request. */
    }
  }
  return {
    read(account: string, key: string): T | null {
      const row = entries().find((row) => row.account === account && row.key === key)
      if (!row) return null
      try {
        return parse(row.value)
      } catch {
        return null
      }
    },
    write(account: string, key: string, value: T): void {
      save(
        [
          { account, key, value, savedAt: Date.now() },
          ...entries().filter((row) => row.account !== account || row.key !== key)
        ].slice(0, MAX_ENTRIES)
      )
    },
    invalidate(account: string): void {
      save(entries().filter((row) => row.account !== account))
    }
  }
}
