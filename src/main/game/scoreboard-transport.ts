import { createHash } from 'node:crypto'

export function decodeScoreboardDelta(previous: string, revision: string, body: string): string {
  const delta: unknown = JSON.parse(body)
  if (!delta || typeof delta !== 'object') throw new Error('Invalid scoreboard delta')
  const value = delta as Record<string, unknown>
  if (
    value.base !== revision ||
    typeof value.revision !== 'string' ||
    !Number.isInteger(value.length) ||
    (value.length as number) < 1 ||
    (value.length as number) > 8192 ||
    !Array.isArray(value.changes) ||
    value.changes.length > 8192
  )
    throw new Error('Invalid scoreboard delta base or size')
  const fields = previous.split(/(\t|\n)/).slice(0, value.length as number)
  fields.length = value.length as number
  const seen = new Set<number>()
  for (const change of value.changes) {
    if (
      !Array.isArray(change) ||
      change.length !== 2 ||
      !Number.isInteger(change[0]) ||
      change[0] < 0 ||
      change[0] >= fields.length ||
      typeof change[1] !== 'string' ||
      seen.has(change[0])
    )
      throw new Error('Invalid scoreboard delta field')
    seen.add(change[0])
    fields[change[0]] = change[1]
  }
  for (let index = 0; index < fields.length; index++)
    if (typeof fields[index] !== 'string') throw new Error('Incomplete scoreboard delta')
  const text = fields.join('')
  if (
    Buffer.byteLength(text) > 8192 ||
    createHash('sha256').update(text).digest('hex') !== value.revision
  )
    throw new Error('Scoreboard delta checksum mismatch')
  return text
}
