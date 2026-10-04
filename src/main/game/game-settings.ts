import { app, dialog } from 'electron'
import { chmod, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, normalize } from 'node:path'
import type { GameSettings } from '../../shared/game-settings'
import {
  DEFAULT_CROSSHAIR,
  parseCrosshairProfile,
  type CrosshairProfile
} from '../../shared/crosshair'
import { normalizeVoicePttKey } from './voice-ptt'
import {
  isNextClientExecutable,
  WINDOWS_STANDALONE_EXECUTABLE_NAMES
} from './windows-cosmetic-compatibility'

interface StoredGameSettings {
  cs16ExecutablePath?: string
  voicePttKey?: string
  partyVoicePttKey?: string
  crosshair?: CrosshairProfile
  nextClientIntegrationEnabled?: boolean
  fastSwitchEnabled?: boolean
  nextClientIntegrationDisabledReason?: string
}

const DEFAULT_TEAM_VOICE_PTT_KEY = 'K'
const DEFAULT_PARTY_VOICE_PTT_KEY = 'V'
const PARTY_VOICE_PTT_PREFIX = 'party:'
const configPath = (): string => join(app.getPath('userData'), 'game-settings.json')
let settingsWriteQueue: Promise<void> = Promise.resolve()

const steamExecutableCandidates = (): string[] => {
  const home = process.env.HOME ?? ''
  if (process.platform === 'win32') {
    return [
      join(process.env.LOCALAPPDATA ?? '', 'Steam', 'steamapps', 'common', 'Half-Life', 'hl.exe'),
      join(process.env.PROGRAMFILES ?? '', 'Steam', 'steamapps', 'common', 'Half-Life', 'hl.exe'),
      join(
        process.env['PROGRAMFILES(X86)'] ?? '',
        'Steam',
        'steamapps',
        'common',
        'Half-Life',
        'hl.exe'
      )
    ]
  }
  return [
    join(home, '.steam', 'steam', 'steamapps', 'common', 'Half-Life', 'hl_linux'),
    join(home, '.local', 'share', 'Steam', 'steamapps', 'common', 'Half-Life', 'hl_linux'),
    join(home, '.steam', 'steam', 'steamapps', 'common', 'Half-Life', 'hl.sh')
  ]
}

/**
 * Conventional folders non-Steam Counter-Strike distributions are unpacked
 * into. These repacks ship a plain directory (for example
 * `C:\Games\Counter-Strike WaRzOnE`) instead of registering with Steam.
 *
 * Detection is strictly read-only and a discovered installation is never
 * modified. Steam candidates are always tried first, so Steam stays the
 * preferred distribution and this scan only runs when nothing else was found.
 */
const standaloneSearchRoots = (): string[] => {
  if (process.platform === 'win32') {
    return [join(process.env.SystemDrive ?? 'C:', 'Games')]
  }
  const home = process.env.HOME ?? ''
  return [join(home, 'Games'), join(home, 'games')]
}

/** Bound the directory scan so detection stays cheap at startup. */
const STANDALONE_SCAN_LIMIT = 64

const isGoldSrcInstallation = async (executable: string): Promise<boolean> => {
  if (!(await stat(executable).catch(() => null))?.isFile()) return false
  if (
    process.platform === 'win32' &&
    basename(executable).toLowerCase() === 'cstrike.exe' &&
    !(await isNextClientExecutable(executable))
  ) {
    return false
  }
  const cstrike = join(dirname(executable), 'cstrike')
  if (!(await stat(cstrike).catch(() => null))?.isDirectory()) return false
  if ((await stat(join(cstrike, 'liblist.gam')).catch(() => null))?.isFile()) return true
  // Some valid standalone builds, including CS WaRzOnE, omit liblist.gam.
  // Require both Counter-Strike game DLLs before accepting that layout.
  if (process.platform !== 'win32') return false
  return (
    (await stat(join(cstrike, 'cl_dlls', 'client.dll')).catch(() => null))?.isFile() === true &&
    (await stat(join(cstrike, 'dlls', 'mp.dll')).catch(() => null))?.isFile() === true
  )
}

const executableNamesForPlatform = (): string[] =>
  // WaRzOnE needs its supported wrapper, NextClient uses cstrike.exe, and CS
  // Xtreme V6 has launcher.exe instead and continues to use hl.exe with its
  // installation-specific arguments.
  process.platform === 'win32' ? [...WINDOWS_STANDALONE_EXECUTABLE_NAMES] : ['hl_linux', 'hl.sh']

const detectStandaloneExecutables = async (): Promise<string[]> => {
  const executableNames = executableNamesForPlatform()
  const detected: string[] = []

  for (const root of standaloneSearchRoots()) {
    if (!isAbsolute(root)) continue
    const entries = await readdir(root, { withFileTypes: true }).catch(() => null)
    if (!entries) continue

    for (const entry of entries.slice(0, STANDALONE_SCAN_LIMIT)) {
      if (!entry.isDirectory()) continue
      for (const name of executableNames) {
        const candidate = join(root, entry.name, name)
        if (await isGoldSrcInstallation(candidate)) detected.push(candidate)
      }
    }
  }

  return detected
}

const detectCs16Executable = async (): Promise<string | null> => {
  for (const candidate of steamExecutableCandidates()) {
    if (!isAbsolute(candidate)) continue
    const metadata = await stat(candidate).catch(() => null)
    if (metadata?.isFile()) return validateExecutable(candidate, true)
  }

  for (const candidate of await detectStandaloneExecutables()) {
    const executable = await validateExecutable(candidate, true).catch(() => null)
    if (executable) return executable
  }

  return null
}

const validateExecutable = async (
  untrustedPath: unknown,
  ensureExecutable = false
): Promise<string> => {
  if (typeof untrustedPath !== 'string' || !isAbsolute(untrustedPath)) {
    throw new Error('Choose an absolute Counter-Strike executable path.')
  }
  const executablePath = normalize(untrustedPath)
  const metadata = await stat(executablePath).catch(() => null)
  if (!metadata?.isFile()) throw new Error('The selected Counter-Strike executable was not found.')
  if (ensureExecutable && process.platform !== 'win32' && (metadata.mode & 0o111) === 0) {
    await chmod(executablePath, metadata.mode | 0o111)
  }
  return executablePath
}

const validateInstallationFolder = async (untrustedPath: unknown): Promise<string> => {
  if (typeof untrustedPath !== 'string' || !isAbsolute(untrustedPath)) {
    throw new Error('Choose an absolute Counter-Strike installation folder.')
  }
  const selectedFolder = normalize(untrustedPath)
  if (!(await stat(selectedFolder).catch(() => null))?.isDirectory()) {
    throw new Error('The selected Counter-Strike installation folder was not found.')
  }
  const folder =
    basename(selectedFolder).toLowerCase() === 'cstrike' ? dirname(selectedFolder) : selectedFolder
  for (const name of executableNamesForPlatform()) {
    const candidate = join(folder, name)
    if (await isGoldSrcInstallation(candidate)) return validateExecutable(candidate, true)
  }
  throw new Error(
    'Choose a Counter-Strike folder containing the game executable and cstrike files.'
  )
}

const readStoredSettings = async (): Promise<StoredGameSettings> => {
  try {
    const parsed = JSON.parse(await readFile(configPath(), 'utf8')) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    const settings = parsed as Partial<StoredGameSettings>
    let crosshair: CrosshairProfile | undefined
    try {
      if (settings.crosshair !== undefined) crosshair = parseCrosshairProfile(settings.crosshair)
    } catch {
      // Ignore a damaged local cosmetic profile.
    }
    return {
      ...(typeof settings.cs16ExecutablePath === 'string'
        ? { cs16ExecutablePath: settings.cs16ExecutablePath }
        : {}),
      ...(typeof settings.voicePttKey === 'string' ? { voicePttKey: settings.voicePttKey } : {}),
      ...(typeof settings.partyVoicePttKey === 'string'
        ? { partyVoicePttKey: settings.partyVoicePttKey }
        : {}),
      ...(crosshair ? { crosshair } : {}),
      ...(typeof settings.nextClientIntegrationEnabled === 'boolean'
        ? { nextClientIntegrationEnabled: settings.nextClientIntegrationEnabled }
        : {}),
      ...(typeof settings.fastSwitchEnabled === 'boolean'
        ? { fastSwitchEnabled: settings.fastSwitchEnabled }
        : {}),
      ...(typeof settings.nextClientIntegrationDisabledReason === 'string' &&
      settings.nextClientIntegrationDisabledReason.length <= 160
        ? { nextClientIntegrationDisabledReason: settings.nextClientIntegrationDisabledReason }
        : {})
    }
  } catch {
    return {}
  }
}

const writeStoredSettings = (settings: StoredGameSettings): Promise<void> => {
  const write = async (): Promise<void> => {
    const destination = configPath()
    const temporary = `${destination}.${process.pid}.tmp`
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    await rename(temporary, destination)
    if (process.platform !== 'win32') await chmod(destination, 0o600)
  }
  const pending = settingsWriteQueue.then(write, write)
  settingsWriteQueue = pending.catch(() => undefined)
  return pending
}

const validateStoredPath = async (settings: StoredGameSettings): Promise<string | null> => {
  if (!settings.cs16ExecutablePath) return null
  try {
    return await validateExecutable(settings.cs16ExecutablePath)
  } catch {
    return null
  }
}

const resolveTeamVoicePttKey = async (storedSettings: StoredGameSettings): Promise<string> => {
  if (storedSettings.voicePttKey) {
    try {
      return normalizeVoicePttKey(storedSettings.voicePttKey)
    } catch {
      // Fall through to the launcher default.
    }
  }
  return DEFAULT_TEAM_VOICE_PTT_KEY
}

const resolvePartyVoicePttKey = (
  storedSettings: StoredGameSettings,
  teamVoicePttKey: string
): string => {
  if (storedSettings.partyVoicePttKey) {
    try {
      const savedKey = normalizeVoicePttKey(storedSettings.partyVoicePttKey)
      if (savedKey.toLowerCase() !== teamVoicePttKey.toLowerCase()) return savedKey
    } catch {
      // Fall through to the launcher default.
    }
  }

  if (DEFAULT_PARTY_VOICE_PTT_KEY !== teamVoicePttKey) return DEFAULT_PARTY_VOICE_PTT_KEY
  return 'B'
}

const buildSettings = async (
  cs16ExecutablePath: string | null,
  teamVoicePttKey: string,
  partyVoicePttKey: string,
  crosshair: CrosshairProfile,
  storedSettings: StoredGameSettings
): Promise<GameSettings> => ({
  cs16ExecutablePath,
  cs16FolderPath: cs16ExecutablePath ? dirname(cs16ExecutablePath) : null,
  configFilePath: configPath(),
  // Keep voicePttKey as the team binding for compatibility with older renderer code.
  voicePttKey: teamVoicePttKey,
  // Index 0 is Team, index 1 is Party. This preserves the existing IPC contract.
  voicePttKeys: [teamVoicePttKey, partyVoicePttKey],
  crosshair,
  nextClientDetected:
    process.platform === 'win32' && cs16ExecutablePath !== null
      ? await isNextClientExecutable(cs16ExecutablePath)
      : false,
  nextClientIntegrationEnabled: storedSettings.nextClientIntegrationEnabled !== false,
  fastSwitchEnabled: storedSettings.fastSwitchEnabled !== false,
  nextClientIntegrationDisabledReason: storedSettings.nextClientIntegrationDisabledReason ?? null
})

const persistResolvedSettings = async (
  cs16ExecutablePath: string | null,
  teamVoicePttKey: string,
  partyVoicePttKey: string,
  crosshair: CrosshairProfile | undefined,
  storedSettings: StoredGameSettings
): Promise<void> => {
  await writeStoredSettings({
    ...(cs16ExecutablePath ? { cs16ExecutablePath } : {}),
    voicePttKey: teamVoicePttKey,
    partyVoicePttKey,
    crosshair: crosshair ?? DEFAULT_CROSSHAIR,
    nextClientIntegrationEnabled: storedSettings.nextClientIntegrationEnabled !== false,
    fastSwitchEnabled: storedSettings.fastSwitchEnabled !== false,
    ...(storedSettings.nextClientIntegrationDisabledReason
      ? { nextClientIntegrationDisabledReason: storedSettings.nextClientIntegrationDisabledReason }
      : {})
  })
}

const resolveVoicePttKeys = async (
  storedSettings: StoredGameSettings
): Promise<{ team: string; party: string }> => {
  const team = await resolveTeamVoicePttKey(storedSettings)
  return { team, party: resolvePartyVoicePttKey(storedSettings, team) }
}

export const getGameSettings = async (): Promise<GameSettings> => {
  const storedSettings = await readStoredSettings()
  let cs16ExecutablePath = await validateStoredPath(storedSettings)
  if (!cs16ExecutablePath) cs16ExecutablePath = await detectCs16Executable()

  const keys = await resolveVoicePttKeys(storedSettings)
  await persistResolvedSettings(
    cs16ExecutablePath,
    keys.team,
    keys.party,
    storedSettings.crosshair,
    storedSettings
  )

  return await buildSettings(
    cs16ExecutablePath,
    keys.team,
    keys.party,
    storedSettings.crosshair ?? DEFAULT_CROSSHAIR,
    storedSettings
  )
}

export const chooseCs16Folder = async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Counter-Strike 1.6 installation folder',
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return null
  const executablePath = await validateInstallationFolder(result.filePaths[0])
  return dirname(executablePath)
}

export const saveGameSettings = async (untrustedPath: unknown): Promise<GameSettings> => {
  const cs16ExecutablePath = await validateInstallationFolder(untrustedPath)
  const storedSettings = await readStoredSettings()
  const keys = await resolveVoicePttKeys(storedSettings)
  await persistResolvedSettings(
    cs16ExecutablePath,
    keys.team,
    keys.party,
    storedSettings.crosshair,
    storedSettings
  )
  return await buildSettings(
    cs16ExecutablePath,
    keys.team,
    keys.party,
    storedSettings.crosshair ?? DEFAULT_CROSSHAIR,
    storedSettings
  )
}

export const saveVoicePttKey = async (untrustedKey: unknown): Promise<GameSettings> => {
  const storedSettings = await readStoredSettings()
  const cs16ExecutablePath = await validateStoredPath(storedSettings)
  const current = await resolveVoicePttKeys(storedSettings)

  let teamVoicePttKey = current.team
  let partyVoicePttKey = current.party
  if (typeof untrustedKey === 'string' && untrustedKey.startsWith(PARTY_VOICE_PTT_PREFIX)) {
    partyVoicePttKey = normalizeVoicePttKey(untrustedKey.slice(PARTY_VOICE_PTT_PREFIX.length))
  } else {
    teamVoicePttKey = normalizeVoicePttKey(untrustedKey)
  }

  if (teamVoicePttKey.toLowerCase() === partyVoicePttKey.toLowerCase()) {
    throw new Error('Team and Party talk need different push-to-talk keys.')
  }

  await persistResolvedSettings(
    cs16ExecutablePath,
    teamVoicePttKey,
    partyVoicePttKey,
    storedSettings.crosshair,
    storedSettings
  )
  return await buildSettings(
    cs16ExecutablePath,
    teamVoicePttKey,
    partyVoicePttKey,
    storedSettings.crosshair ?? DEFAULT_CROSSHAIR,
    storedSettings
  )
}

export const saveCrosshair = async (untrustedProfile: unknown): Promise<GameSettings> => {
  const crosshair = parseCrosshairProfile(untrustedProfile)
  const storedSettings = await readStoredSettings()
  const cs16ExecutablePath = await validateStoredPath(storedSettings)
  const keys = await resolveVoicePttKeys(storedSettings)
  await persistResolvedSettings(
    cs16ExecutablePath,
    keys.team,
    keys.party,
    crosshair,
    storedSettings
  )
  return await buildSettings(cs16ExecutablePath, keys.team, keys.party, crosshair, storedSettings)
}

export const getSavedCs16Executable = async (): Promise<string | null> => {
  const storedSettings = await readStoredSettings()
  const cs16ExecutablePath = await validateStoredPath(storedSettings)
  if (!cs16ExecutablePath) return null

  const keys = await resolveVoicePttKeys(storedSettings)
  if (storedSettings.voicePttKey !== keys.team || storedSettings.partyVoicePttKey !== keys.party) {
    await persistResolvedSettings(
      cs16ExecutablePath,
      keys.team,
      keys.party,
      storedSettings.crosshair,
      storedSettings
    )
  }
  return cs16ExecutablePath
}

export const saveNextClientIntegration = async (
  untrustedEnabled: unknown
): Promise<GameSettings> => {
  if (typeof untrustedEnabled !== 'boolean') throw new Error('Invalid in-game enhancements setting')
  const storedSettings = await readStoredSettings()
  const updated: StoredGameSettings = {
    ...storedSettings,
    nextClientIntegrationEnabled: untrustedEnabled,
    nextClientIntegrationDisabledReason: undefined
  }
  const cs16ExecutablePath = await validateStoredPath(updated)
  const keys = await resolveVoicePttKeys(updated)
  await persistResolvedSettings(
    cs16ExecutablePath,
    keys.team,
    keys.party,
    updated.crosshair,
    updated
  )
  return await buildSettings(
    cs16ExecutablePath,
    keys.team,
    keys.party,
    updated.crosshair ?? DEFAULT_CROSSHAIR,
    updated
  )
}

export const saveFastSwitch = async (untrustedEnabled: unknown): Promise<GameSettings> => {
  if (typeof untrustedEnabled !== 'boolean') throw new Error('Invalid fast switch setting')
  const storedSettings = await readStoredSettings()
  const updated: StoredGameSettings = { ...storedSettings, fastSwitchEnabled: untrustedEnabled }
  const cs16ExecutablePath = await validateStoredPath(updated)
  const keys = await resolveVoicePttKeys(updated)
  await persistResolvedSettings(
    cs16ExecutablePath,
    keys.team,
    keys.party,
    updated.crosshair,
    updated
  )
  return buildSettings(
    cs16ExecutablePath,
    keys.team,
    keys.party,
    updated.crosshair ?? DEFAULT_CROSSHAIR,
    updated
  )
}

export const disableNextClientIntegrationAfterCrash = async (): Promise<void> => {
  const storedSettings = await readStoredSettings()
  const updated: StoredGameSettings = {
    ...storedSettings,
    nextClientIntegrationEnabled: false,
    nextClientIntegrationDisabledReason:
      'Automatically disabled after NextClient exited abnormally during integration startup.'
  }
  const cs16ExecutablePath = await validateStoredPath(updated)
  const keys = await resolveVoicePttKeys(updated)
  await persistResolvedSettings(
    cs16ExecutablePath,
    keys.team,
    keys.party,
    updated.crosshair,
    updated
  )
}

export const getSavedVoicePttKey = async (): Promise<string> => {
  const storedSettings = await readStoredSettings()
  const keys = await resolveVoicePttKeys(storedSettings)
  return `${keys.team}|${keys.party}`
}
