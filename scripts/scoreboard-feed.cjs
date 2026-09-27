/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const fs = require('node:fs')
const path = require('node:path')

const MAX_BYTES = 8192
const MAX_AGE_MS = 3000

function parseSnapshot(text) {
  const lines = text.split('\n')
  const header = lines.shift()?.replace(/\r$/, '')
  if (!header?.startsWith('#16c-scoreboard-v2\t') || lines.length > 34) return null
  const headerFields = header.slice(19).split('\t')
  if (headerFields.length !== 3) return null
  const [map, roundText, modeText] = headerFields
  if (!/^[a-zA-Z0-9_]{1,32}$/.test(map)) return null
  const round = Number(roundText)
  if (!Number.isInteger(round) || round < 0 || round > 99) return null
  if (modeText !== '0' && modeText !== '1') return null
  const players = []
  const seen = new Set()
  for (const line of lines) {
    if (!line) continue
    const parts = line.replace(/\r$/, '').split('\t')
    if (parts.length !== 7) return null
    const [id, team, kills, assists, deaths, ping] = parts.slice(0, 6).map(Number)
    const name = parts[6]
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      id > 32 ||
      seen.has(id) ||
      !Number.isInteger(team) ||
      team < 0 ||
      team > 3 ||
      !Number.isInteger(kills) ||
      kills < -999 ||
      kills > 9999 ||
      !Number.isInteger(assists) ||
      assists < 0 ||
      assists > 9999 ||
      !Number.isInteger(deaths) ||
      deaths < 0 ||
      deaths > 9999 ||
      !Number.isInteger(ping) ||
      ping < 0 ||
      ping > 9999 ||
      !name ||
      name.length > 32 ||
      Array.from(name).some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
      })
    )
      return null
    seen.add(id)
    players.push({ id, team, name, kills, assists, deaths, ping })
  }
  players.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id)
  return { map, round, mode: modeText === '1' ? 'ffa' : 'competitive', players }
}

function readSnapshot(session) {
  const file = path.join(
    session,
    'game',
    'cstrike',
    'addons',
    'amxmodx',
    'data',
    '16c_scoreboard.tsv'
  )
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size > MAX_BYTES || Date.now() - stat.mtimeMs > MAX_AGE_MS)
      return null
    return parseSnapshot(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

module.exports = { parseSnapshot, readSnapshot }
