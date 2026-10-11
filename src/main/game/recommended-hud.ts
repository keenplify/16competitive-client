import { cpus, machine, totalmem } from 'node:os'

interface HudDevice {
  platform: string
  architecture: string
  machine: string
  memoryBytes: number
  cpuModels: readonly string[]
}

/** Local setup heuristic, not a benchmark. No hardware details are uploaded. */
export const recommendLightweightHud = (
  device: HudDevice = {
    platform: process.platform,
    architecture: process.arch,
    machine: machine(),
    memoryBytes: totalmem(),
    cpuModels: cpus().map((cpu) => cpu.model)
  }
): boolean => {
  // GoldSrc's Linux client is x86; ARM Linux (including Asahi) adds translation
  // overhead even on capable hardware. Check the host as well as Electron's arch.
  const translatedLinux =
    device.platform === 'linux' &&
    (/^(arm64|arm|aarch64)$/i.test(device.architecture) ||
      /^(arm64|aarch64|armv[5-8].*)$/i.test(device.machine))
  const limitedMemory = device.memoryBytes > 0 && device.memoryBytes <= 4 * 1024 ** 3
  const limitedCpu =
    (device.cpuModels.length > 0 && device.cpuModels.length <= 2) ||
    device.cpuModels.some((model) => /\b(Celeron|Pentium|Atom)\b/i.test(model))
  return translatedLinux || limitedMemory || limitedCpu
}
