import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { API_BASE_URL } from './config'
import type { IcafeBranchInfo, IcafeBranchStatus } from '../shared/auth'

type BranchConfig = { version: 1; partnerPlayerId: string; branchId: string; branchToken: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const externalPath = () => {
  const sharedPath = process.env.ICAFE_BRANCH_CONFIG_PATH?.trim()
  return sharedPath && isAbsolute(sharedPath) ? sharedPath : null
}
const localPath = () => join(app.getPath('userData'), 'icafe-branch.json')
const encryptedPath = () => join(app.getPath('userData'), 'icafe-branch.bin')

const parseConfig = (value: unknown): BranchConfig | null => {
  if (!value || typeof value !== 'object') return null
  const config = value as Record<string, unknown>
  if (
    config.version !== 1 ||
    typeof config.partnerPlayerId !== 'string' ||
    typeof config.branchId !== 'string' ||
    typeof config.branchToken !== 'string' ||
    !uuid.test(config.partnerPlayerId) ||
    !uuid.test(config.branchId) ||
    !/^icafe_[A-Za-z0-9_-]{40,80}$/.test(config.branchToken)
  )
    return null
  return config as BranchConfig
}

const readBranchConfig = async (): Promise<BranchConfig | null> => {
  const shared = externalPath()
  if (!shared) {
    try {
      const encrypted = await readFile(encryptedPath())
      if (!safeStorage.isEncryptionAvailable()) return null
      return parseConfig(JSON.parse(safeStorage.decryptString(encrypted)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[iCafe] Enrolled branch config could not be read')
        return null
      }
    }
  }
  let raw: string
  try {
    raw = await readFile(shared ?? localPath(), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    console.warn('[iCafe] Branch config could not be read')
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn('[iCafe] Branch config is invalid')
    return null
  }
  const config = parseConfig(parsed)
  if (!config) {
    console.warn('[iCafe] Branch config is invalid')
    return null
  }
  return config
}

const verifyBranchConfig = async (config: BranchConfig): Promise<IcafeBranchInfo | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/icafe/branch-info`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(5_000)
    })
    if (!response.ok) return null
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object') return null
    const info = value as Record<string, unknown>
    if (
      typeof info.branchName !== 'string' ||
      info.branchName.trim().length < 1 ||
      info.branchName.length > 64 ||
      info.xpMultiplier !== 1.2
    )
      return null
    return { branchName: info.branchName, xpMultiplier: 1.2 }
  } catch {
    return null
  }
}

/** Only validated, non-secret branch metadata crosses into the renderer. */
export const getIcafeBranchInfo = async (): Promise<IcafeBranchStatus> => {
  const config = await readBranchConfig()
  return {
    info: config ? await verifyBranchConfig(config) : null,
    hasConfig: config !== null,
    managedExternally: externalPath() !== null
  }
}

export const linkIcafeBranch = async (code: string): Promise<IcafeBranchStatus> => {
  if (externalPath()) throw new Error('ICAFE_MANAGED_EXTERNALLY')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('ICAFE_SECURE_STORAGE_UNAVAILABLE')
  if (!/^\d{6}$/.test(code)) throw new Error('ICAFE_INVALID_CODE')
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/icafe/link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(5_000)
    })
  } catch {
    throw new Error('ICAFE_LINK_UNAVAILABLE')
  }
  if (!response.ok)
    throw new Error(response.status === 429 ? 'ICAFE_TOO_MANY_ATTEMPTS' : 'ICAFE_INVALID_CODE')
  const raw: unknown = await response.json().catch(() => null)
  const config = parseConfig(raw)
  if (!config || !raw || typeof raw !== 'object') throw new Error('ICAFE_INVALID_CONFIG')
  const enrollment = raw as Record<string, unknown>
  if (
    typeof enrollment.branchName !== 'string' ||
    !enrollment.branchName.trim() ||
    enrollment.branchName.length > 64 ||
    enrollment.xpMultiplier !== 1.2
  )
    throw new Error('ICAFE_INVALID_CONFIG')
  const target = encryptedPath()
  const temporary = `${target}.${randomUUID()}.tmp`
  await mkdir(dirname(target), { recursive: true })
  try {
    await writeFile(temporary, safeStorage.encryptString(JSON.stringify(config)), {
      mode: 0o600,
      flag: 'wx'
    })
    await rename(temporary, target)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
  return {
    info: { branchName: enrollment.branchName, xpMultiplier: 1.2 },
    hasConfig: true,
    managedExternally: false
  }
}

export const unlinkIcafeBranch = async (
  sessionToken: string | null
): Promise<IcafeBranchStatus> => {
  if (externalPath()) throw new Error('ICAFE_MANAGED_EXTERNALLY')
  for (const path of [encryptedPath(), localPath()]) {
    await unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
  if (sessionToken) {
    try {
      const response = await fetch(`${API_BASE_URL}/icafe/deactivate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sessionToken}` },
        signal: AbortSignal.timeout(5_000)
      })
      if (!response.ok) throw new Error('ICAFE_UNLINK_UNAVAILABLE')
    } catch {
      throw new Error('ICAFE_UNLINK_UNAVAILABLE')
    }
  }
  return getIcafeBranchInfo()
}

/** The renderer never reads the installed branch credential. */
export const activateIcafeBranch = async (sessionToken: string): Promise<void> => {
  const config = await readBranchConfig()
  if (!config) return
  try {
    const response = await fetch(`${API_BASE_URL}/icafe/activate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${sessionToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(5_000)
    })
    if (!response.ok) console.warn('[iCafe] Branch activation rejected', response.status)
  } catch {
    console.warn('[iCafe] Branch activation unavailable')
  }
}
