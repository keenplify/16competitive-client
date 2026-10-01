import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { STOCK_GAME_DIR } from './game-directory'

export type VoiceTalkChannel = 'team' | 'party'
const DEFAULT_TEAM_KEY = 'K'
const DEFAULT_PARTY_KEY = 'V'
const POLL_MS = 30

// GoldSrc keynum values from the engine's keydefs.h.
const SPECIAL_KEYS: Record<string, number> = {
  SPACE: 32,
  CTRL: 133,
  SHIFT: 134,
  ALT: 132,
  ENTER: 13,
  TAB: 9,
  ESCAPE: 27,
  BACKSPACE: 127,
  UPARROW: 128,
  DOWNARROW: 129,
  LEFTARROW: 130,
  RIGHTARROW: 131,
  INS: 147,
  DEL: 148,
  HOME: 151,
  END: 152,
  PGUP: 150,
  PGDN: 149,
  MOUSE1: 241,
  MOUSE2: 242,
  MOUSE3: 243,
  MOUSE4: 244,
  MOUSE5: 245
}

const configPathFor = (gameDirectory: string): string =>
  basename(gameDirectory).toLowerCase() === STOCK_GAME_DIR
    ? join(gameDirectory, 'config.cfg')
    : join(gameDirectory, STOCK_GAME_DIR, 'config.cfg')

export const normalizeVoicePttKey = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Choose a valid push-to-talk key.')
  const key = value.trim().toUpperCase()
  if (/^[A-Z0-9]$/.test(key) || /^F(?:[1-9]|1[0-2])$/.test(key) || key in SPECIAL_KEYS) return key
  throw new Error('That key cannot be used for push-to-talk.')
}

export const goldSrcKeyCode = (key: string): number => {
  const normalized = normalizeVoicePttKey(key)
  if (normalized.length === 1) return normalized.toLowerCase().charCodeAt(0)
  if (normalized.startsWith('F')) return 134 + Number(normalized.slice(1))
  return SPECIAL_KEYS[normalized]
}

export const readVoicePttKeys = async (gameDirectory: string): Promise<string[]> => {
  const contents = await readFile(configPathFor(gameDirectory), 'utf8').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return ''
      throw error
    }
  )
  return contents.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*bind\s+"?([^"\s]+)"?\s+"?\+voicerecord"?\s*$/i.exec(line)
    return match ? [match[1]] : []
  })
}

export const readVoicePttKey = async (gameDirectory: string): Promise<string | null> => {
  for (const key of await readVoicePttKeys(gameDirectory)) {
    try {
      return normalizeVoicePttKey(key)
    } catch {
      /* unsupported GoldSrc key */
    }
  }
  return null
}

export interface VoicePttSession {
  keys: string[]
  attachNative(directory: string): Promise<void>
  stop(): void
}

export const prepareVoicePtt = (
  onPtt: (active: boolean, channel: VoiceTalkChannel) => void,
  configuredKeys?: string
): VoicePttSession => {
  const [rawTeam, rawParty] = configuredKeys?.split('|', 2) ?? []
  const team = normalizeVoicePttKey(rawTeam || DEFAULT_TEAM_KEY)
  let party = normalizeVoicePttKey(rawParty || DEFAULT_PARTY_KEY)
  if (party === team) party = team === 'B' ? 'N' : 'B'
  const codes = [goldSrcKeyCode(team), goldSrcKeyCode(party)]
  let timer: NodeJS.Timeout | null = null
  let reading = false
  let stopped = false
  let active = [false, false]
  let statePath = ''

  const reset = (): void => {
    for (let index = 0; index < 2; index++) {
      if (active[index]) onPtt(false, index === 0 ? 'team' : 'party')
    }
    active = [false, false]
  }

  const poll = async (): Promise<void> => {
    if (reading || stopped) return
    reading = true
    try {
      const contents = await readFile(statePath, 'ascii')
      if (stopped) return
      const match = /^([01]) ([01])\n$/.exec(contents)
      if (!match) return
      const next = [match[1] === '1', match[2] === '1']
      for (let index = 0; index < 2; index++) {
        if (next[index] !== active[index]) onPtt(next[index], index === 0 ? 'team' : 'party')
      }
      active = next
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.warn('[VoicePTT] native state unavailable', error)
      reset()
    } finally {
      reading = false
    }
  }

  return {
    keys: [team, party],
    attachNative: async (directory) => {
      if (stopped || timer) return
      // The in-game module reads two GoldSrc key codes and leaves game binds alone.
      await writeFile(join(directory, 'ptt.keys'), `${codes[0]} ${codes[1]}\n`, {
        encoding: 'ascii',
        mode: 0o600
      })
      statePath = join(directory, 'ptt.state')
      timer = setInterval(() => void poll(), POLL_MS)
      timer.unref()
    },
    stop: () => {
      stopped = true
      if (timer) clearInterval(timer)
      timer = null
      reset()
    }
  }
}
