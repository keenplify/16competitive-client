import { app, shell, nativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, unlink, chmod } from 'node:fs/promises'
import { join, dirname, isAbsolute } from 'node:path'
import { API_BASE_URL } from './config'
import { detectDownloadPartner } from './partner-attribution'
import { parsePartnerBranding, type PartnerBrandingResponse } from '../shared/partner-branding'
import {
  DEFAULT_APP_NAME,
  INSTALLED_APP_ID,
  partnerDesktopEntry
} from '../shared/partner-app-shortcuts'

export interface InstalledAppIdentity {
  name: string
  icon: string
}
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
async function atomicWrite(path: string, bytes: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.partial`
  try {
    await writeFile(temporary, bytes, { mode: 0o600 })
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}
async function fetchBytes(url: string, max: number): Promise<Buffer> {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
  if (!response.ok || !response.body) throw new Error('Partner identity download unavailable')
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > max) throw new Error('Partner identity download too large')
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks)
}
const trustedShortcut = (path: string, executable: string): boolean => {
  try {
    return shell.readShortcutLink(path).target.toLowerCase() === executable.toLowerCase()
  } catch {
    return false
  }
}

/** Only our known shortcut names and matching executable targets are ever replaced. */
async function updateShortcuts(
  root: string,
  partnerId: string,
  identity: InstalledAppIdentity,
  ico: string
): Promise<void> {
  if (!app.isPackaged) return
  const executable =
    process.platform === 'linux' ? (process.env.APPIMAGE ?? process.execPath) : process.execPath
  if (!isAbsolute(executable)) throw new Error('Invalid installed executable')
  const marker = join(root, 'shortcut-name.json')
  let previous: string | null = null
  try {
    const raw: unknown = JSON.parse(await readFile(marker, 'utf8'))
    if (typeof raw === 'string' && raw.length <= 64 && !/[\p{Cc}\p{Cf}<>:"/\\|?*]/u.test(raw))
      previous = raw
  } catch {
    /* First installation has no managed shortcut marker. */
  }
  if (process.platform === 'win32') {
    const locations = [
      app.getPath('desktop'),
      join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    ]
    for (const folder of locations) {
      const path = join(folder, `${identity.name}.lnk`)
      let exists = false
      try {
        await readFile(path)
        exists = true
      } catch {
        /* No shortcut at this name. */
      }
      if (exists && !trustedShortcut(path, executable)) continue
      await mkdir(folder, { recursive: true })
      if (
        !shell.writeShortcutLink(path, exists ? 'update' : 'create', {
          target: executable,
          cwd: dirname(executable),
          icon: ico,
          iconIndex: 0,
          appUserModelId: INSTALLED_APP_ID,
          description: identity.name
        })
      )
        throw new Error('Could not update partner shortcut')
      for (const old of new Set([previous, DEFAULT_APP_NAME])) {
        if (old && old !== identity.name) {
          const oldPath = join(folder, `${old}.lnk`)
          if (trustedShortcut(oldPath, executable)) await unlink(oldPath)
        }
      }
    }
  } else if (process.platform === 'linux') {
    const data =
      process.env.XDG_DATA_HOME && isAbsolute(process.env.XDG_DATA_HOME)
        ? process.env.XDG_DATA_HOME
        : join(app.getPath('home'), '.local', 'share')
    const file = `16competitive-partner-${partnerId}.desktop`
    for (const path of [join(data, 'applications', file), join(app.getPath('desktop'), file)]) {
      let existing: string | null = null
      try {
        existing = await readFile(path, 'utf8')
      } catch {
        /* New desktop entry. */
      }
      if (existing && !existing.includes('X-16Competitive-Managed=true')) continue
      await atomicWrite(path, partnerDesktopEntry(identity.name, executable, identity.icon))
      await chmod(path, 0o755)
    }
  }
  await atomicWrite(marker, JSON.stringify(identity.name))
}

export async function initializePartnerAppIdentity(
  fallbackIcon: string,
  apply: (identity: InstalledAppIdentity) => void
): Promise<void> {
  const partnerId = await detectDownloadPartner()
  if (!partnerId) return
  const root = join(app.getPath('userData'), 'partner-app-identity', partnerId)
  const cache = join(root, 'branding.json')
  const applyBranding = async (
    result: PartnerBrandingResponse,
    download: boolean
  ): Promise<void> => {
    if (result.branding && result.branding.partnerId !== partnerId)
      throw new Error('Partner identity mismatch')
    const branding = result.branding,
      identity = { name: branding?.appName ?? DEFAULT_APP_NAME, icon: fallbackIcon }
    let icoPath = process.platform === 'win32' ? process.execPath : fallbackIcon
    if (branding?.appIcon) {
      const icon = branding.appIcon
      for (const [url, hash, extension] of [
        [icon.pngUrl, icon.pngSha256, 'png'],
        [icon.icoUrl, icon.icoSha256, 'ico']
      ] as const) {
        const path = join(root, `${hash}.${extension}`)
        const bytes = await readFile(path).catch(() => null)
        if (!bytes || sha256(bytes) !== hash) {
          if (!download) throw new Error('Cached partner icon integrity check failed')
          const downloaded = await fetchBytes(url, 4 * 1024 * 1024)
          if (sha256(downloaded) !== hash) throw new Error('Partner icon integrity check failed')
          await atomicWrite(path, downloaded)
        }
        if (extension === 'png') identity.icon = path
        else icoPath = path
      }
      const image = nativeImage.createFromPath(identity.icon)
      const size = image.getSize()
      if (image.isEmpty() || size.width !== 512 || size.height !== 512)
        throw new Error('Invalid installed partner icon')
    }
    if (!branding?.appIcon && app.isPackaged && process.platform === 'linux') {
      const bytes = await readFile(fallbackIcon)
      const path = join(root, `stock-${sha256(bytes)}.png`)
      await atomicWrite(path, bytes)
      identity.icon = path
    }
    apply(identity)
    await updateShortcuts(root, partnerId, identity, icoPath).catch((error: unknown) => {
      console.warn(
        '[PartnerIdentity] could not update managed shortcuts',
        error instanceof Error ? error.message : String(error)
      )
    })
  }
  try {
    const bytes = await readFile(cache)
    if (bytes.length > 65536) throw new Error('Invalid partner identity cache')
    await applyBranding(
      parsePartnerBranding(JSON.parse(bytes.toString('utf8')), API_BASE_URL),
      false
    )
  } catch {
    /* A missing or invalid cache falls back to the packaged identity. */
  }
  void (async () => {
    const bytes = await fetchBytes(
      new URL(`/partners/branding/public/${partnerId}`, API_BASE_URL).toString(),
      65536
    )
    const result = parsePartnerBranding(JSON.parse(bytes.toString('utf8')), API_BASE_URL)
    await applyBranding(result, true)
    await atomicWrite(cache, JSON.stringify(result))
  })().catch((error: unknown) =>
    console.warn(
      '[PartnerIdentity] keeping the last verified identity',
      error instanceof Error ? error.message : String(error)
    )
  )
}
