import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const CS13_DEFAULT_BINDINGS: ReadonlyArray<readonly [string, string]> = [
  ['w', '+forward'],
  ['s', '+back'],
  ['a', '+moveleft'],
  ['d', '+moveright'],
  ['SPACE', '+jump'],
  ['CTRL', '+duck'],
  ['SHIFT', '+speed'],
  ['e', '+use'],
  ['MOUSE1', '+attack'],
  ['MOUSE2', '+attack2'],
  ['r', '+reload'],
  ['q', 'lastinv'],
  ['MWHEELUP', 'invprev'],
  ['MWHEELDOWN', 'invnext'],
  ['TAB', '+showscores'],
  ['b', 'buy'],
  ['o', 'buyequip'],
  [',', 'buyammo1'],
  ['.', 'buyammo2'],
  ['g', 'drop'],
  ['m', 'chooseteam'],
  ['n', 'nightvision'],
  ['z', 'radio1'],
  ['x', 'radio2'],
  ['c', 'radio3'],
  ['y', 'messagemode'],
  ['u', 'messagemode2'],
  ['f', 'impulse 100'],
  ['t', 'impulse 201'],
  ['1', 'slot1'],
  ['2', 'slot2'],
  ['3', 'slot3'],
  ['4', 'slot4'],
  ['5', 'slot5'],
  ['6', 'slot6'],
  ['7', 'slot7'],
  ['8', 'slot8'],
  ['9', 'slot9'],
  ['0', 'slot10'],
  ['ESCAPE', 'cancelselect'],
  ['`', 'toggleconsole']
]

export function cs13MissingBindingCommands(output: string): string[] {
  const missing = new Set(
    [...output.matchAll(/^"([^"\r\n]+)" is not bound\r?$/gm)].map((match) => match[1].toLowerCase())
  )
  return CS13_DEFAULT_BINDINGS.filter(([key]) => missing.has(key.toLowerCase())).map(
    ([key, command]) => `bind "${key}" "${command}"`
  )
}

/** Query the game's live bindings, then fill only unbound keys. */
export async function prepareCs13Controls(gameDirectory: string): Promise<{
  probeName: string
  applyName: string
  start: () => void
  cleanup: () => Promise<void>
}> {
  const id = randomBytes(8).toString('hex')
  const probeName = `16c13_controls_${id}.cfg`
  const applyName = `16c13_bindings_${id}.cfg`
  const begin = `16c_controls_begin_${id}`
  const end = `16c_controls_end_${id}`
  const probe =
    `// Launcher-owned live key queries\necho ${begin}\n` +
    CS13_DEFAULT_BINDINGS.map(([key]) => `bind "${key}"`).join('\n') +
    `\necho ${end}\n` +
    'wait\n'.repeat(60) +
    `exec ${applyName}\n`
  let applied = '// Launcher-owned controls; waiting for live key queries\n'
  await writeFile(join(gameDirectory, probeName), probe, { flag: 'wx', mode: 0o600 })
  try {
    await writeFile(join(gameDirectory, applyName), applied, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    await rm(join(gameDirectory, probeName))
    throw error
  }
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let task: Promise<void> = Promise.resolve()
  let startedAt = 0
  const poll = async (): Promise<void> => {
    if (stopped) return
    try {
      const logPath = join(gameDirectory, 'qconsole.log')
      const logInfo = await lstat(logPath)
      if (!logInfo.isFile() || logInfo.isSymbolicLink()) return
      const file = await open(logPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      let output: string
      try {
        const info = await file.stat()
        if (!info.isFile()) return
        const size = Math.min(info.size, 65536)
        const bytes = Buffer.alloc(size)
        const { bytesRead } = await file.read(bytes, 0, size, Math.max(0, info.size - size))
        output = bytes.subarray(0, bytesRead).toString('utf8')
      } finally {
        await file.close()
      }
      const first = output.indexOf(begin)
      const last = output.indexOf(end, first + begin.length)
      if (first >= 0 && last > first) {
        const commands = cs13MissingBindingCommands(output.slice(first + begin.length, last))
        const contents =
          '// Launcher-owned defaults for keys confirmed unbound\n' +
          commands.join('\n') +
          (commands.length ? '\n+mlook\n' : '\n')
        const destination = join(gameDirectory, applyName)
        const info = await lstat(destination)
        if (
          !info.isFile() ||
          info.isSymbolicLink() ||
          (await readFile(destination, 'utf8')) !== applied
        )
          throw new Error('Changed launcher controls file preserved')
        const temporary = `${destination}.pending`
        let createdTemporary = false
        try {
          await writeFile(temporary, contents, { flag: 'wx', mode: 0o600 })
          createdTemporary = true
          await rename(temporary, destination)
          applied = contents
        } finally {
          if (createdTemporary) await rm(temporary, { force: true })
        }
        console.info('[CS13] Live controls prepared', { restoredKeys: commands.length })
        return
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.warn('[CS13] Could not query live controls', {
          code: (error as NodeJS.ErrnoException).code ?? 'READ_FAILED'
        })
    }
    if (!stopped && Date.now() - startedAt < 15000)
      timer = setTimeout(() => {
        task = poll()
      }, 20)
  }
  return {
    probeName,
    applyName,
    start: () => {
      startedAt = Date.now()
      task = poll()
    },
    cleanup: async () => {
      stopped = true
      clearTimeout(timer)
      await task
      for (const [name, contents] of [
        [probeName, probe],
        [applyName, applied]
      ]) {
        const path = join(gameDirectory, name)
        try {
          const info = await lstat(path)
          if (
            !info.isFile() ||
            info.isSymbolicLink() ||
            info.size > 8192 ||
            (await readFile(path, 'utf8')) !== contents
          )
            throw new Error('Changed launcher controls file preserved')
          await rm(path)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
    }
  }
}
