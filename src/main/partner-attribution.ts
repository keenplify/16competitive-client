import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { API_BASE_URL } from './config'
import { isPartnerId, partnerIdFromDownloadName } from '../shared/partner-attribution'
const marker = () => join(app.getPath('userData'), 'partner-attribution.json')
const readMarker = async (path: string): Promise<string | null> => {
  const bytes = await readFile(path).catch(() => null)
  if (!bytes || bytes.length > 1024) return null
  try {
    const value: unknown = JSON.parse(bytes.toString('utf8'))
    const id =
      value && typeof value === 'object' ? (value as { partnerId?: unknown }).partnerId : null
    return isPartnerId(id) ? id : null
  } catch {
    return null
  }
}
export const detectDownloadPartner = async (): Promise<string | null> => {
  const installed = app.isPackaged
    ? await readMarker(join(process.resourcesPath, 'partner-attribution.json'))
    : null
  const id =
    installed ?? partnerIdFromDownloadName(basename(process.env.APPIMAGE ?? process.execPath))
  if (!id) return readMarker(marker())
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(marker(), JSON.stringify({ partnerId: id }), { mode: 0o600 })
  return id
}
export const linkDownloadPartner = async (token: string, playerId?: string): Promise<void> => {
  try {
    const partnerId = await detectDownloadPartner()
    if (!partnerId) return
    const consideredPath = isPartnerId(playerId)
      ? join(app.getPath('userData'), `partner-considered-${playerId}.json`)
      : null
    if (consideredPath && (await readMarker(consideredPath)) === partnerId) return
    const response = await fetch(`${API_BASE_URL}/partners/referral`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ partnerId }),
      signal: AbortSignal.timeout(5000)
    })
    if (response.ok && consideredPath)
      await writeFile(consideredPath, JSON.stringify({ partnerId }), { mode: 0o600 })
    if (!response.ok)
      console.warn('[Partner] download attribution was not accepted', { status: response.status })
  } catch (error) {
    console.warn(
      '[Partner] could not link download attribution',
      error instanceof Error ? error.message : String(error)
    )
  }
}
