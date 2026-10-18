import type { MatchHistoryEntry } from './match-history'
export interface ProfileActivityEntry {
  id: string
  matches: number
  wins: number
}
export function profileActivity(
  matches: MatchHistoryEntry[],
  field: 'mapId' | 'mode',
  limit = 5
): ProfileActivityEntry[] {
  const groups = new Map<string, ProfileActivityEntry>()
  for (const match of matches) {
    const id = match[field]
    const group = groups.get(id) ?? { id, matches: 0, wins: 0 }
    group.matches += 1
    if (match.result === 'win') group.wins += 1
    groups.set(id, group)
  }
  return [...groups.values()]
    .sort((a, b) => b.matches - a.matches || a.id.localeCompare(b.id))
    .slice(0, limit)
}

export function profileMapAxes(
  entries: ProfileActivityEntry[]
): Array<ProfileActivityEntry & { others?: boolean }> {
  const sorted = [...entries].sort((a, b) => b.matches - a.matches || a.id.localeCompare(b.id))
  if (sorted.length <= 8) return sorted
  return [
    ...sorted.slice(0, 7),
    {
      id: '',
      others: true,
      matches: sorted.slice(7).reduce((sum, entry) => sum + entry.matches, 0),
      wins: sorted.slice(7).reduce((sum, entry) => sum + entry.wins, 0)
    }
  ]
}
