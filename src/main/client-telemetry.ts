import { app, ipcMain } from 'electron'
import { arch, cpus, platform, release, totalmem, version } from 'node:os'
import type { DeviceStatus } from '../shared/anti-cheat'
import { ANTICHEAT_CHANNELS } from '../shared/anti-cheat'
import { collectHardwareFingerprint, getDeviceBanStatus } from './anticheat/hardware-fingerprint'
import { API_BASE_URL } from './config'

const trimText = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

const gpuDescriptions = async (): Promise<string[]> => {
  try {
    const info = (await app.getGPUInfo('basic')) as unknown
    if (typeof info !== 'object' || info === null) return []
    const devices = (info as Record<string, unknown>).gpuDevice
    if (!Array.isArray(devices)) return []

    return devices
      .slice(0, 16)
      .map((device) => {
        if (typeof device !== 'object' || device === null) return undefined
        const record = device as Record<string, unknown>
        const name = trimText(record.deviceString, 160)
        const vendorId =
          typeof record.vendorId === 'number' ? record.vendorId.toString(16) : undefined
        const deviceId =
          typeof record.deviceId === 'number' ? record.deviceId.toString(16) : undefined
        const ids = vendorId && deviceId ? `PCI ${vendorId}:${deviceId}` : undefined
        return trimText([name, ids].filter(Boolean).join(' · '), 256)
      })
      .filter((item): item is string => Boolean(item))
  } catch {
    return []
  }
}

export const reportClientTelemetry = async (token: string): Promise<DeviceStatus | null> => {
  try {
    const cpuList = cpus()
    const firstCpu = cpuList[0]
    const hardware = await collectHardwareFingerprint()
    const body = {
      clientVersion: app.getVersion(),
      platform: platform(),
      architecture: arch(),
      osRelease: release(),
      osVersion: trimText(version(), 256),
      cpuModel: trimText(firstCpu?.model, 256),
      logicalCpuCount: cpuList.length || undefined,
      cpuSpeedMhz:
        Number.isInteger(firstCpu?.speed) && firstCpu.speed > 0 ? firstCpu.speed : undefined,
      totalMemoryMb: Math.max(1, Math.round(totalmem() / 1024 / 1024)),
      gpuDevices: await gpuDescriptions(),
      ...hardware
    }

    const response = await fetch(`${API_BASE_URL}/auth/client-telemetry`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(7_500)
    })
    const responseBody = (await response.json().catch(() => null)) as {
      ban?: DeviceStatus
      error?: unknown
    } | null

    if (response.status === 403 && responseBody?.ban?.banned === true) {
      return responseBody.ban
    }
    if (!response.ok) {
      console.warn(`Client telemetry was not accepted (${response.status})`)
    }
    return { banned: false }
  } catch (error) {
    console.warn(
      'Could not report client telemetry:',
      error instanceof Error ? error.message : String(error)
    )
    return null
  }
}

ipcMain.handle(ANTICHEAT_CHANNELS.deviceStatus, () => getDeviceBanStatus())
