import { API_BASE_URL, LOCAL_DEVELOPMENT } from '../config'
import type { DeviceStatus } from '../../shared/anti-cheat'
import { requestHelperDevice } from './helper-process'

/** Validate the server status forwarded by Rust; no hardware identifiers enter Electron. */
export function parseDeviceStatus(value: unknown): DeviceStatus {
  if (!value || typeof value !== 'object') throw new Error('Invalid device status')
  const status = value as Record<string, unknown>
  if (status.banned === false) return { banned: false }
  if (
    status.banned !== true ||
    typeof status.permanent !== 'boolean' ||
    !Number.isInteger(status.offenseCount) ||
    Number(status.offenseCount) < 1 ||
    !(status.expiresAt === null || typeof status.expiresAt === 'string') ||
    !['displayUntil', 'reason', 'appealEmail'].every(
      (key) => typeof status[key] === 'string' && String(status[key]).length <= 2000
    )
  )
    throw new Error('Invalid device status')
  return {
    banned: true,
    permanent: status.permanent,
    offenseCount: Number(status.offenseCount),
    expiresAt: status.expiresAt as string | null,
    displayUntil: String(status.displayUntil),
    reason: String(status.reason),
    appealEmail: String(status.appealEmail)
  }
}

export const getDeviceBanStatus = async (): Promise<DeviceStatus> =>
  parseDeviceStatus(
    await requestHelperDevice({ apiUrl: API_BASE_URL, allowInsecureLocal: LOCAL_DEVELOPMENT })
  )
