import { readFile, writeFile } from 'node:fs/promises'

const identityLine = /^\s*setinfo\s+"?_16c"?\s+"?([^"\s;]+)"?\s*$/i

/** Keep startup config replays from replacing this session's connection identity. */
export async function prepareMatchIdentityConfig(
  path: string,
  token: string
): Promise<() => Promise<void>> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) throw new Error('Invalid match join token')
  const source = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (source === null) return async () => undefined
  const original = source.split(/\r?\n/).filter((line) => identityLine.test(line))
  const replace = (text: string, lines: string[]): string => {
    const newline = text.includes('\r\n') ? '\r\n' : '\n'
    return [...text.split(/\r?\n/).filter((line) => !identityLine.test(line)), ...lines].join(
      newline
    )
  }
  await writeFile(path, replace(source, [`setinfo "_16c" "${token}"`]), 'utf8')
  return async () => {
    const current = await readFile(path, 'utf8')
    const identities = current.split(/\r?\n/).flatMap((line) => identityLine.exec(line)?.[1] ?? [])
    // Do not overwrite a newer session or a user change.
    if (!identities.length || identities.some((value) => value !== token)) return
    await writeFile(path, replace(current, original), 'utf8')
  }
}
