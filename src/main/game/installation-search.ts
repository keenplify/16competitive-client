import { opendir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'

/** Read-only search under an explicitly selected folder; never follow links. */
export async function findInstallation<T>(
  folder: string,
  validate: (candidate: string) => Promise<T | null>
): Promise<T | null> {
  const direct = await validate(folder)
  if (direct) return direct
  const root = await realpath(folder)
  const started = Date.now()
  const queue = [{ path: root, depth: 0 }]
  let entriesLeft = 4096
  for (let index = 0; index < queue.length && index < 512; index++) {
    if (!entriesLeft || Date.now() - started > 5000) break
    const directory = queue[index]
    if (index > 0) {
      const result = await validate(directory.path)
      if (result) return result
    }
    if (directory.depth >= 8) continue
    const handle = await opendir(directory.path).catch(() => null)
    if (!handle) continue
    const children: string[] = []
    for await (const entry of handle) {
      if (!entriesLeft || Date.now() - started > 5000) break
      entriesLeft--
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      const path = await realpath(join(directory.path, entry.name)).catch(() => null)
      if (!path) continue
      const child = relative(root, path)
      if (
        isAbsolute(child) ||
        child === '..' ||
        child.startsWith('../') ||
        child.startsWith('..\\')
      )
        continue
      children.push(path)
    }
    for (const path of children.sort().slice(0, Math.max(0, 512 - queue.length)))
      queue.push({ path, depth: directory.depth + 1 })
  }
  return null
}
