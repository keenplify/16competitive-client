/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const fs = require('node:fs')
const path = require('node:path')

const MAX_BYTES = 8192
const MAX_AGE_MS = 3000

function parseSnapshot(text) {
  const lines = text.split('\n')
  const header = lines.shift()?.replace(/\r$/, '')
  if (!/^#16c-scoreboard-v(?:[2-9]|10)\t/.test(header ?? '') || lines.length > 34) return null
  const withAlive = !header.startsWith('#16c-scoreboard-v2\t')
  const withBot = /^#16c-scoreboard-v(?:[4-9]|10)\t/.test(header)
  const withMoney = /^#16c-scoreboard-v(?:[7-9]|10)\t/.test(header)
  const withWeapon = /^#16c-scoreboard-v(?:[89]|10)\t/.test(header)
  const withHealth = header.startsWith('#16c-scoreboard-v10\t')
  const withRoundEvents = header.startsWith('#16c-scoreboard-v9\t')
  const withFormat = /^#16c-scoreboard-v(?:[6-9]|10)\t/.test(header)
  const withRoundWinners = withFormat || header.startsWith('#16c-scoreboard-v5\t')
  const headerFields = header.slice(header.indexOf('\t') + 1).split('\t')
  if (
    headerFields.length !==
    (withRoundEvents ? 11 : withHealth ? 9 : withFormat ? 8 : withRoundWinners ? 4 : 3)
  )
    return null
  const [
    map,
    roundText,
    modeText,
    roundWinners = '',
    halfRoundsText,
    winTargetText,
    ctWinsText,
    tWinsText,
    roundEvents = '',
    ctLossBonusText,
    tLossBonusText
  ] = headerFields
  const buytimeText = withHealth ? headerFields[8] : null
  if (!/^[a-zA-Z0-9_]{1,32}$/.test(map)) return null
  const round = Number(roundText)
  if (!Number.isInteger(round) || round < 0 || round > 99) return null
  if (modeText !== '0' && modeText !== '1') return null
  if (withHealth && buytimeText !== '0' && buytimeText !== '1') return null
  if (!/^[CT]{0,99}$/.test(roundWinners) || roundWinners.length > round) return null
  const halfRounds = withFormat ? Number(halfRoundsText) : 12
  const winTarget = withFormat ? Number(winTargetText) : 13
  const ctWins = withFormat ? Number(ctWinsText) : null
  const tWins = withFormat ? Number(tWinsText) : null
  const ctLossBonus = withRoundEvents ? Number(ctLossBonusText) : null
  const tLossBonus = withRoundEvents ? Number(tLossBonusText) : null
  if (
    !Number.isInteger(halfRounds) ||
    halfRounds < 0 ||
    halfRounds > 49 ||
    !Number.isInteger(winTarget) ||
    winTarget < 1 ||
    winTarget > 99 ||
    (withFormat &&
      (!Number.isInteger(ctWins) ||
        ctWins < 0 ||
        ctWins > 99 ||
        !Number.isInteger(tWins) ||
        tWins < 0 ||
        tWins > 99)) ||
    (withRoundEvents &&
      (!/^[DBCKHU]{0,99}$/.test(roundEvents) ||
        roundEvents.length > round ||
        !Number.isInteger(ctLossBonus) ||
        ctLossBonus < 0 ||
        ctLossBonus > 16000 ||
        !Number.isInteger(tLossBonus) ||
        tLossBonus < 0 ||
        tLossBonus > 16000)) ||
    (modeText === '0' && halfRounds === 0)
  )
    return null
  const players = []
  const seen = new Set()
  for (const line of lines) {
    if (!line) continue
    const parts = line.replace(/\r$/, '').split('\t')
    if (
      parts.length !==
      (withHealth ? 12 : withWeapon ? 11 : withMoney ? 10 : withBot ? 9 : withAlive ? 8 : 7)
    )
      return null
    const [id, team, kills, assists, deaths, ping, alive, bot] = parts
      .slice(0, withBot ? 8 : withAlive ? 7 : 6)
      .map(Number)
    const money = withMoney ? Number(parts[8]) : null
    const primaryWeapon = withWeapon ? Number(parts[9]) : null
    const health = withHealth ? Number(parts[10]) : null
    const name =
      parts[withHealth ? 11 : withWeapon ? 10 : withMoney ? 9 : withBot ? 8 : withAlive ? 7 : 6]
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
      (withAlive && alive !== 0 && alive !== 1) ||
      (withBot && bot !== 0 && bot !== 1) ||
      (withMoney && (!Number.isInteger(money) || money < 0 || money > 16000)) ||
      (withWeapon &&
        (!Number.isInteger(primaryWeapon) || primaryWeapon < 0 || primaryWeapon > 31)) ||
      (withHealth && (!Number.isInteger(health) || health < 0 || health > 255)) ||
      !name ||
      name.length > 32 ||
      Array.from(name).some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
      })
    )
      return null
    seen.add(id)
    players.push({
      id,
      team,
      name,
      kills,
      assists,
      deaths,
      ping,
      alive: !withAlive || alive === 1,
      bot: withBot && bot === 1,
      money,
      primaryWeapon,
      ...(withHealth ? { health } : {})
    })
  }
  players.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id)
  return {
    map,
    round,
    mode: modeText === '1' ? 'ffa' : 'competitive',
    roundWinners: withRoundWinners ? roundWinners : null,
    halfRounds,
    winTarget,
    ctWins,
    tWins,
    roundEvents: withRoundEvents ? roundEvents : null,
    ctLossBonus,
    tLossBonus,
    ...(withHealth ? { buytimeActive: buytimeText === '1' } : {}),
    players
  }
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
