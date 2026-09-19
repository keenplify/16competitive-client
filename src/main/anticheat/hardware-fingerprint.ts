import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpus, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { API_BASE_URL } from '../config'
import type {
  DeviceStatus,
  HardwareFingerprint,
  HardwareSignal,
  HardwareSignalKind
} from '../../shared/anti-cheat'

const HASH_NAMESPACE = '16competitive-hwid-v1'
const MAX_SIGNALS = 32

const placeholderValues = new Set([
  '',
  'NONE',
  'UNKNOWN',
  'DEFAULT STRING',
  'TO BE FILLED BY O.E.M.',
  'TO BE FILLED BY OEM',
  'SYSTEM SERIAL NUMBER',
  'NOT SPECIFIED',
  'NOT APPLICABLE'
])

const normalizeValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase()
  if (!normalized || placeholderValues.has(normalized)) return null
  if (/^(?:0+|F+|-+)$/.test(normalized.replace(/[^A-F0-9-]/g, ''))) return null
  return normalized.slice(0, 512)
}

const hashSignal = (kind: HardwareSignalKind, rawValue: string): HardwareSignal => ({
  kind,
  hash: createHash('sha256').update(`${HASH_NAMESPACE}|${kind}|${rawValue}`).digest('hex')
})

const dedupeSignals = (signals: HardwareSignal[]): HardwareSignal[] => {
  const seen = new Set<string>()
  return signals.filter((signal) => {
    const key = `${signal.kind}:${signal.hash}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const runPowerShellJson = async (): Promise<Record<string, unknown>> => {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$result = [ordered]@{}',
    '$result.system_uuid = @((Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue | ForEach-Object { $_.UUID }))',
    '$result.motherboard_serial = @((Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue | ForEach-Object { $_.SerialNumber }))',
    '$result.bios_serial = @((Get-CimInstance Win32_BIOS -ErrorAction SilentlyContinue | ForEach-Object { $_.SerialNumber }))',
    '$result.disk_serial = @((Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue | Sort-Object Index | ForEach-Object { $_.SerialNumber }))',
    "$machineGuid = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid -ErrorAction SilentlyContinue).MachineGuid",
    '$result.machine_guid = @($machineGuid)',
    '$result.cpu = @((Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | ForEach-Object { "$($_.ProcessorId)|$($_.Name)" }))',
    '$tpm = Get-TpmEndorsementKeyInfo -HashAlgorithm Sha256 -ErrorAction SilentlyContinue',
    '$result.tpm_ek = @()',
    'if ($tpm -and $tpm.IsPresent -and $tpm.PublicKeyHash) { $result.tpm_ek = @([string]$tpm.PublicKeyHash) }',
    '$result | ConvertTo-Json -Compress -Depth 4'
  ].join('; ')

  const executable = process.env.SystemRoot
    ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'

  return await new Promise((resolveResult) => {
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-Command', script], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    let stdout = ''
    const timeout = setTimeout(() => child.kill(), 7_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < 128_000) stdout += chunk.toString('utf8')
    })
    child.once('error', () => {
      clearTimeout(timeout)
      resolveResult({})
    })
    child.once('exit', () => {
      clearTimeout(timeout)
      try {
        const parsed = JSON.parse(stdout.trim()) as unknown
        resolveResult(
          parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
        )
      } catch {
        resolveResult({})
      }
    })
  })
}

const valuesFor = (record: Record<string, unknown>, key: string): string[] => {
  const raw = record[key]
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw]
  return list.map(normalizeValue).filter((value): value is string => Boolean(value))
}

const networkAdapterSignals = (): HardwareSignal[] => {
  const macs = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => !entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00')
    .map((entry) => entry.mac.replace(/[^A-Fa-f0-9]/g, '').toUpperCase())
    .filter(Boolean)
    .sort()
  return Array.from(new Set(macs))
    .slice(0, 8)
    .map((mac) => hashSignal('network_adapter', mac))
}

const fallbackCpuSignal = (): HardwareSignal[] => {
  const model = normalizeValue(cpus()[0]?.model)
  return model ? [hashSignal('cpu', model)] : []
}

let fingerprintPromise: Promise<HardwareFingerprint> | null = null

export const collectHardwareFingerprint = async (): Promise<HardwareFingerprint> => {
  if (fingerprintPromise) return fingerprintPromise
  fingerprintPromise = (async () => {
    const signals: HardwareSignal[] = []

    if (process.platform === 'win32') {
      const hardware = await runPowerShellJson()
      const kinds: HardwareSignalKind[] = [
        'system_uuid',
        'motherboard_serial',
        'bios_serial',
        'disk_serial',
        'machine_guid',
        'cpu',
        'tpm_ek'
      ]
      for (const kind of kinds) {
        for (const value of valuesFor(hardware, kind)) signals.push(hashSignal(kind, value))
      }
    } else {
      signals.push(...fallbackCpuSignal())
    }

    signals.push(...networkAdapterSignals())
    const hardwareSignals = dedupeSignals(signals).slice(0, MAX_SIGNALS)
    const fingerprintMaterial = hardwareSignals
      .map((signal) => `${signal.kind}:${signal.hash}`)
      .sort()
      .join('\n')

    return {
      ...(fingerprintMaterial
        ? {
            hardwareFingerprintHash: createHash('sha256')
              .update(`${HASH_NAMESPACE}|composite|${fingerprintMaterial}`)
              .digest('hex')
          }
        : {}),
      hardwareSignals
    }
  })()
  return fingerprintPromise
}

export const getDeviceBanStatus = async (): Promise<DeviceStatus> => {
  const fingerprint = await collectHardwareFingerprint()
  try {
    const response = await fetch(`${API_BASE_URL}/auth/anti-cheat/device-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fingerprint),
      signal: AbortSignal.timeout(7_500)
    })
    if (!response.ok) return { banned: false }
    const body = (await response.json().catch(() => null)) as DeviceStatus | null
    return body?.banned === true ? body : { banned: false }
  } catch {
    return { banned: false }
  }
}
