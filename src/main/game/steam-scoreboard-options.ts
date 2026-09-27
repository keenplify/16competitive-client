import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { copyFile, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const APP_BLOCK = /^(\t{5}"10"\s*\n\t{5}\{\n)([\s\S]*?)(^\t{5}\})/gm
const OPTION_LINE = /^(\t{6}"LaunchOptions"\s*)"((?:\\.|[^"\\])*)"/m

const decodeVdf = (value: string): string => value.replace(/\\([\\"])/g, '$1')
const encodeVdf = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

export const patchSteamScoreboardOption = (
  source: string,
  wrapperPath: string
): { text: string; changed: boolean } | null => {
  if (/[\r\n"]/.test(wrapperPath)) return null
  const matches = [...source.matchAll(APP_BLOCK)]
  if (matches.length !== 1) return null
  const match = matches[0]
  const block = match[2]
  const existing = OPTION_LINE.exec(block)
  const current = existing ? decodeVdf(existing[2]) : ''
  if (current.includes(wrapperPath)) return { text: source, changed: false }
  const command = `"${wrapperPath}" %command%`
  const next = current.includes('%command%')
    ? current.replace('%command%', command)
    : `${command}${current.trim() ? ` ${current.trim()}` : ''}`
  const updatedBlock = existing
    ? block.replace(OPTION_LINE, `$1"${encodeVdf(next)}"`)
    : `${block}\t\t\t\t\t\t"LaunchOptions"\t\t"${encodeVdf(next)}"\n`
  const start = match.index + match[1].length
  return {
    text: source.slice(0, start) + updatedBlock + source.slice(start + block.length),
    changed: true
  }
}

const locateConfig = async (): Promise<string | null> => {
  const candidates = new Set<string>()
  for (const root of [join(homedir(), '.steam/steam'), join(homedir(), '.local/share/Steam')]) {
    const users = await readdir(join(root, 'userdata'), { withFileTypes: true }).catch(() => [])
    for (const user of users) {
      if (!user.isDirectory() || !/^\d+$/.test(user.name)) continue
      const path = join(root, 'userdata', user.name, 'config/localconfig.vdf')
      if ((await stat(path).catch(() => null))?.isFile()) candidates.add(path)
    }
  }
  // Steam's usual root paths are aliases of one directory. Realpath would
  // deduplicate them, but the file identity is enough and needs no extra I/O.
  const files = await Promise.all(
    [...candidates].map(async (path) => ({ path, info: await stat(path).catch(() => null) }))
  )
  const unique = new Map<string, string>()
  for (const file of files) {
    if (file.info) unique.set(`${file.info.dev}:${file.info.ino}`, file.path)
  }
  const eligible: string[] = []
  for (const path of unique.values()) {
    const content = await readFile(path, 'utf8').catch(() => '')
    if ([...content.matchAll(APP_BLOCK)].length === 1) eligible.push(path)
  }
  return eligible.length === 1 ? eligible[0] : null
}

const runSteam = async (args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('steam', args, {
      detached: args[0] !== '-shutdown',
      stdio: 'ignore'
    })
    child.once('error', reject)
    child.once('spawn', () => {
      if (args[0] !== '-shutdown') {
        child.unref()
        resolve()
      }
    })
    if (args[0] === '-shutdown') child.once('exit', () => resolve())
  })

export const ensureSteamScoreboardOption = async (
  wrapperPath: string,
  steamRunning: () => Promise<boolean>
): Promise<boolean> => {
  const configPath = await locateConfig()
  if (!configPath) return false
  const current = await readFile(configPath, 'utf8')
  const planned = patchSteamScoreboardOption(current, wrapperPath)
  if (!planned) return false
  if (!planned.changed) return true

  const wasRunning = await steamRunning()
  if (wasRunning) {
    // Steam keeps Launch Options in memory and writes localconfig.vdf when it
    // exits. Stop it before the edit, then start it again so it reads the new
    // value. This runs once for a newly configured installation.
    await runSteam(['-shutdown'])
    for (let attempt = 0; attempt < 60 && (await steamRunning()); attempt++) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
    }
    if (await steamRunning()) return false
  }

  const latest = await readFile(configPath, 'utf8')
  const patch = patchSteamScoreboardOption(latest, wrapperPath)
  if (!patch) return false
  if (patch.changed) {
    const temporary = `${configPath}.16c-tmp`
    const info = await stat(configPath)
    await copyFile(
      configPath,
      `${configPath}.before-16c-scoreboard`,
      constants.COPYFILE_EXCL
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
    await writeFile(temporary, patch.text, { mode: info.mode & 0o777 })
    await rename(temporary, configPath)
  }
  if (wasRunning) {
    await runSteam(['-silent'])
    for (let attempt = 0; attempt < 60 && !(await steamRunning()); attempt++) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
    }
    if (!(await steamRunning())) return false
  }
  return true
}
