export type HardwareSignalKind =
  | 'system_uuid'
  | 'motherboard_serial'
  | 'bios_serial'
  | 'disk_serial'
  | 'machine_guid'
  | 'cpu'
  | 'tpm_ek'
  | 'network_adapter'

export interface HardwareSignal {
  kind: HardwareSignalKind
  hash: string
}

export interface HardwareFingerprint {
  hardwareFingerprintHash?: string
  hardwareSignals: HardwareSignal[]
}

export interface DeviceBanStatus {
  banned: true
  permanent: boolean
  offenseCount: number
  expiresAt: string | null
  displayUntil: string
  reason: string
  appealEmail: string
}

export type DeviceStatus = DeviceBanStatus | { banned: false }

export interface AntiCheatApi {
  getDeviceStatus: () => Promise<DeviceStatus>
}

export const ANTICHEAT_CHANNELS = {
  deviceStatus: 'antiCheat:deviceStatus'
} as const
