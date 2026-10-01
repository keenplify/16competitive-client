import { constants } from 'node:fs'
import { copyFile, lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Recovery for configs damaged by older launcher voice-bind restoration. A
// normal config is never edited; this requires an unbindall followed by almost
// no bindings, including no movement or primary attack binding.
const STOCK_BINDINGS: ReadonlyArray<readonly [string, string]> = [
  ['TAB', '+showscores'],
  ['ENTER', '+attack'],
  ['SPACE', '+jump'],
  [',', 'buyammo1'],
  ['.', 'buyammo2'],
  ['0', 'slot10'],
  ['1', 'slot1'],
  ['2', 'slot2'],
  ['3', 'slot3'],
  ['4', 'slot4'],
  ['5', 'slot5'],
  ['6', 'slot6'],
  ['7', 'slot7'],
  ['8', 'slot8'],
  ['9', 'slot9'],
  ['[', 'invprev'],
  [']', 'invnext'],
  ['a', '+moveleft'],
  ['b', 'buy'],
  ['c', 'radio3'],
  ['d', '+moveright'],
  ['e', '+use'],
  ['f', 'impulse 100'],
  ['g', 'drop'],
  ['h', '+commandmenu'],
  ['i', 'showbriefing'],
  ['m', 'chooseteam'],
  ['n', 'nightvision'],
  ['o', 'buyequip'],
  ['q', 'lastinv'],
  ['r', '+reload'],
  ['s', '+back'],
  ['t', 'impulse 201'],
  ['u', 'messagemode2'],
  ['w', '+forward'],
  ['x', 'radio2'],
  ['y', 'messagemode'],
  ['z', 'radio1'],
  ['UPARROW', '+forward'],
  ['DOWNARROW', '+back'],
  ['LEFTARROW', '+left'],
  ['RIGHTARROW', '+right'],
  ['ALT', '+strafe'],
  ['CTRL', '+duck'],
  ['SHIFT', '+speed'],
  ['F1', 'autobuy'],
  ['F2', 'rebuy'],
  ['F5', 'snapshot'],
  ['MOUSE1', '+attack'],
  ['MOUSE2', '+attack2'],
  ['MWHEELDOWN', 'invnext'],
  ['MWHEELUP', 'invprev']
]

const bind = /^\s*bind\s+(?:"([^"]+)"|([^\s]+))\s+(?:"([^"]*)"|([^\s]+))/i
const boundKeys = (contents: string): Map<string, string> => {
  const effective = new Map<string, string>()
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*unbindall\s*$/i.test(line)) effective.clear()
    const match = bind.exec(line)
    if (match) effective.set((match[1] ?? match[2]).toLowerCase(), match[3] ?? match[4])
  }
  return effective
}

export const bindingRecoveryCommands = (contents: string): string[] | null => {
  if (!/^\s*unbindall\s*$/im.test(contents)) return null
  const effective = boundKeys(contents)
  if (effective.size > 5) return null
  if (
    [...effective.values()].some((command) =>
      /^\+(?:forward|back|moveleft|moveright|attack|left|right)$/i.test(command.trim())
    )
  )
    return null
  const missing = STOCK_BINDINGS.filter(([key]) => !effective.has(key.toLowerCase()))
  return missing.map(([key, command]) => `bind "${key}" "${command}"`)
}

export const recoverBrokenBindings = (contents: string): string | null => {
  const commands = bindingRecoveryCommands(contents)
  if (commands === null) return null
  const eol = contents.includes('\r\n') ? '\r\n' : '\n'
  return `${contents.replace(/[\r\n]*$/, '')}${eol}${commands.join(eol)}${eol}`
}

export const repairBrokenBindings = async (
  gameDirectory: string
): Promise<{ repaired: boolean; backupPath?: string; bindCommands?: string[] }> => {
  const configPath = join(gameDirectory, 'config.cfg')
  const entry = await lstat(configPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!entry || !entry.isFile() || entry.isSymbolicLink() || entry.size > 128 * 1024)
    return { repaired: false }
  // Latin-1 is a byte-preserving decode for legacy GoldSrc cfg encodings.
  const original = await readFile(configPath, 'latin1')
  const bindCommands = bindingRecoveryCommands(original)
  if (bindCommands === null) return { repaired: false }
  // Respect players who intentionally keep their controls in a separate cfg.
  for (const name of ['userconfig.cfg', 'autoexec.cfg']) {
    const extra = await readFile(join(gameDirectory, name), 'latin1').catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return ''
        throw error
      }
    )
    if (
      [...boundKeys(extra).values()].some((command) =>
        /^\+(?:forward|back|moveleft|moveright|attack)$/i.test(command.trim())
      )
    )
      return { repaired: false }
  }
  const backupPath = `${configPath}.16competitive-before-bind-repair-${Date.now()}.bak`
  const temporary = `${configPath}.16competitive-bind-repair-${process.pid}.tmp`
  await copyFile(configPath, backupPath, constants.COPYFILE_EXCL)
  try {
    const eol = original.includes('\r\n') ? '\r\n' : '\n'
    const repaired = `${original.replace(/[\r\n]*$/, '')}${eol}${bindCommands.join(eol)}${eol}`
    await writeFile(temporary, repaired, { encoding: 'latin1', mode: entry.mode })
    await rename(temporary, configPath)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
  return { repaired: true, backupPath, bindCommands }
}
