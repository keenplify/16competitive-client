import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type GoldSrcModDirectory = 'cstrike' | 'cstrk13'
export type CosmeticRuntime = 'native' | 'wine'
export type GoldSrcClientFamily = 'cs16' | 'won13'
export const GOLDSRC_COSMETIC_CAPABILITIES = {
  cs16: { managedProxyMatches: true, modernBlend: true, modernJoinRecovery: true },
  // Activation also requires a signed loader-aware bundle and the exact hw.dll.
  // Its private helper preserves client.dll and adapts only the load pathname.
  won13: { managedProxyMatches: true, modernBlend: false, modernJoinRecovery: false }
} as const
export const WON13_CLIENT_SHA256 =
  '71fdbe140df3598a74738537b924141f4fb4b0b828737bd99a7223d9e4549460'
export const WON13_ENGINE_SHA256 =
  '525c1a32a520bbde8857e8dc3ed1e5bbc8b2ef5620bc6cdbcdbc72c34542bace'
export const WON13_OPENGL_SHA256 =
  'c047cd0f87f379fe3d24d7f2e07241eb11d590211157be5a527bc9d9f295e922'

export function classifyGoldSrcClient(
  version: string,
  clientHash: string,
  engineHash: string
): GoldSrcClientFamily | null {
  if (version === '1.3')
    return clientHash === WON13_CLIENT_SHA256 && engineHash === WON13_ENGINE_SHA256 ? 'won13' : null
  if (clientHash === WON13_CLIENT_SHA256 || engineHash === WON13_ENGINE_SHA256) return null
  // The caller separately checks the modern PE/SDK export contract.
  return version === '1.6' || version === '' ? 'cs16' : null
}

export async function detectGoldSrcCosmeticFamily(
  root: string,
  game: GoldSrcModDirectory
): Promise<GoldSrcClientFamily | null> {
  const bounded = async (path: string, max: number): Promise<Buffer> => {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > max)
      throw new Error('Unsupported GoldSrc client file')
    return readFile(path)
  }
  const metadata = (
    await bounded(join(root, game, 'liblist.gam'), 32768).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return Buffer.alloc(0)
      throw error
    })
  ).toString('utf8')
  const versions = [...metadata.matchAll(/^\s*version\s+"([^"\r\n]+)"\s*$/gm)]
  if (versions.length > 1 || (versions.length === 0 && metadata.trim())) return null
  const version = versions[0]?.[1] ?? ''
  if (version === '1.6' || version === '') return 'cs16'
  if (version !== '1.3') return null
  const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
  const [client, engine] = await Promise.all([
    bounded(join(root, game, 'cl_dlls/client.dll'), 128 * 1024 * 1024),
    bounded(join(root, 'hl.exe'), 64 * 1024 * 1024)
  ])
  const family = classifyGoldSrcClient(version, hash(client), hash(engine))
  if (
    family === 'won13' &&
    hash(await bounded(join(root, 'hw.dll'), 64 * 1024 * 1024)) !== WON13_OPENGL_SHA256
  )
    return null
  return family
}

export function toWinePath(path: string): string {
  if (!path.startsWith('/') || /[\0\r\n]/.test(path)) throw new Error('Invalid Wine path')
  return `Z:${path.replaceAll('/', '\\')}`
}
export function fromWinePath(path: string): string {
  if (!/^Z:\\/i.test(path) || /[\0\r\n]/.test(path))
    throw new Error('Unsupported Wine recovery path')
  return path.slice(2).replaceAll('\\', '/')
}
