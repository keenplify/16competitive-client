import { stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export const WINDOWS_STANDALONE_EXECUTABLE_NAMES = [
  'CS16Launcher.exe',
  'cstrike.exe',
  'hl.exe'
] as const

// Named exports forwarded or wrapped by the signed Windows x86 cosmetic proxy.
// Keep in sync with cosmetic-module/windows-client-exports.txt in the helper.
export const WINDOWS_CLIENT_EXPORTS = [
  '?AttemptToMaterialize@CBasePlayerItem@@QAEXXZ',
  '?CorpseFallThink@CBaseMonster@@QAEXXZ',
  '?DefaultTouch@CBasePlayerAmmo@@QAEXPAVCBaseEntity@@@Z',
  '?DefaultTouch@CBasePlayerItem@@QAEXPAVCBaseEntity@@@Z',
  '?DestroyItem@CBasePlayerItem@@QAEXXZ',
  '?FallThink@CBasePlayerItem@@QAEXXZ',
  '?Materialize@CBasePlayerAmmo@@QAEXXZ',
  '?Materialize@CBasePlayerItem@@QAEXXZ',
  '?PlayerDeathThink@CBasePlayer@@QAEXXZ',
  '?SUB_CallUseToggle@CBaseEntity@@QAEXXZ',
  '?SUB_Remove@CBaseEntity@@QAEXXZ',
  '?Smack@CKnife@@QAEXXZ',
  '?SwingAgain@CKnife@@QAEXXZ',
  'CAM_Think',
  'CL_CameraOffset',
  'CL_CreateMove',
  'CL_IsThirdPerson',
  'ClientFactory',
  'CreateInterface',
  'Demo_ReadBuffer',
  'F',
  'HUD_AddEntity',
  'HUD_ChatInputPosition',
  'HUD_ConnectionlessPacket',
  'HUD_CreateEntities',
  'HUD_DirectorMessage',
  'HUD_DrawNormalTriangles',
  'HUD_DrawTransparentTriangles',
  'HUD_Frame',
  'HUD_GetHullBounds',
  'HUD_GetPlayerTeam',
  'HUD_GetStudioModelInterface',
  'HUD_GetUserEntity',
  'HUD_Init',
  'HUD_Key_Event',
  'HUD_PlayerMove',
  'HUD_PlayerMoveInit',
  'HUD_PlayerMoveTexture',
  'HUD_PostRunCmd',
  'HUD_ProcessPlayerState',
  'HUD_Redraw',
  'HUD_Reset',
  'HUD_Shutdown',
  'HUD_StudioEvent',
  'HUD_TempEntUpdate',
  'HUD_TxferLocalOverrides',
  'HUD_TxferPredictionData',
  'HUD_UpdateClientData',
  'HUD_VidInit',
  'HUD_VoiceStatus',
  'IN_Accumulate',
  'IN_ActivateMouse',
  'IN_ClearStates',
  'IN_DeactivateMouse',
  'IN_MouseEvent',
  'Initialize',
  'KB_Find',
  'V_CalcRefdef',
  'weapon_ak47',
  'weapon_aug',
  'weapon_awp',
  'weapon_c4',
  'weapon_deagle',
  'weapon_elite',
  'weapon_famas',
  'weapon_fiveseven',
  'weapon_flashbang',
  'weapon_g3sg1',
  'weapon_galil',
  'weapon_glock18',
  'weapon_hegrenade',
  'weapon_knife',
  'weapon_m249',
  'weapon_m3',
  'weapon_m4a1',
  'weapon_mac10',
  'weapon_mp5navy',
  'weapon_p228',
  'weapon_p90',
  'weapon_scout',
  'weapon_sg550',
  'weapon_sg552',
  'weapon_smokegrenade',
  'weapon_tmp',
  'weapon_ump45',
  'weapon_usp',
  'weapon_xm1014'
] as const

/** Structural compatibility only; this is never an anti-cheat verdict. */
export function supportsWindowsCosmeticClient(bytes: Uint8Array): boolean {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const fits = (offset: number, size: number): boolean =>
    Number.isSafeInteger(offset) && offset >= 0 && size >= 0 && offset + size <= data.length
  if (!fits(0, 64) || data.readUInt16LE(0) !== 0x5a4d) return false
  const pe = data.readUInt32LE(0x3c)
  if (!fits(pe, 24) || data.readUInt32LE(pe) !== 0x4550) return false
  if (data.readUInt16LE(pe + 4) !== 0x14c || !(data.readUInt16LE(pe + 22) & 0x2000)) return false
  const sectionCount = data.readUInt16LE(pe + 6)
  const optionalSize = data.readUInt16LE(pe + 20)
  const optional = pe + 24
  if (optionalSize < 104 || !fits(optional, optionalSize) || data.readUInt16LE(optional) !== 0x10b)
    return false
  if (data.readUInt32LE(optional + 92) < 1) return false
  const sections = optional + optionalSize
  if (!sectionCount || sectionCount > 96 || !fits(sections, sectionCount * 40)) return false
  const resolve = (rva: number, size: number): number | null => {
    for (let i = 0; i < sectionCount; i++) {
      const section = sections + i * 40
      const base = data.readUInt32LE(section + 12)
      const rawSize = data.readUInt32LE(section + 16)
      const raw = data.readUInt32LE(section + 20)
      const delta = rva - base
      if (delta >= 0 && delta + size <= rawSize && fits(raw + delta, size)) return raw + delta
    }
    return null
  }
  const exportsRva = data.readUInt32LE(optional + 96)
  const exportsSize = data.readUInt32LE(optional + 100)
  const directory = resolve(exportsRva, 40)
  if (!exportsRva || exportsSize < 40 || directory === null) return false
  const functionCount = data.readUInt32LE(directory + 20)
  const nameCount = data.readUInt32LE(directory + 24)
  if (!functionCount || functionCount > 65536 || !nameCount || nameCount > 65536) return false
  const functions = resolve(data.readUInt32LE(directory + 28), functionCount * 4)
  const names = resolve(data.readUInt32LE(directory + 32), nameCount * 4)
  const ordinals = resolve(data.readUInt32LE(directory + 36), nameCount * 2)
  if (functions === null || names === null || ordinals === null) return false
  const found = new Set<string>()
  for (let i = 0; i < nameCount; i++) {
    const nameRva = data.readUInt32LE(names + i * 4)
    const ordinal = data.readUInt16LE(ordinals + i * 2)
    if (ordinal >= functionCount) return false
    const functionRva = data.readUInt32LE(functions + ordinal * 4)
    if (!functionRva || resolve(functionRva, 1) === null) return false
    // Do not wrap another forwarding proxy as the original client.
    if (functionRva >= exportsRva && functionRva < exportsRva + exportsSize) return false
    let name = ''
    let terminated = false
    for (let j = 0; j < 512; j++) {
      const offset = resolve(nameRva + j, 1)
      if (offset === null) return false
      const char = data[offset]
      if (char === 0) {
        terminated = true
        break
      }
      if (char < 32 || char > 126) return false
      name += String.fromCharCode(char)
    }
    if (!terminated) return false
    found.add(name)
  }
  return WINDOWS_CLIENT_EXPORTS.every((name) => found.has(name))
}

const optionalFile = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/**
 * NextClient scans and patches byte patterns in client.dll. In an isolated
 * 2.5.3 test, replacing that DLL with our proxy made client_mini.dll's lookup
 * return null, then crash at RVA 0xC0BC (0xC0000005). The stock DLL hash being
 * allowlisted for other games does not make this installation compatible.
 */
export const isNextClientInstallation = async (gameRoot: string): Promise<boolean> => {
  const [clientMini, nitroApi] = await Promise.all([
    optionalFile(join(gameRoot, 'cstrike', 'cl_dlls', 'client_mini.dll')),
    optionalFile(join(gameRoot, 'nitro_api2.dll'))
  ])
  return clientMini && nitroApi
}

/** Official NextClient builds are launched through cstrike.exe, not hl.exe. */
export const isNextClientExecutable = async (executable: string): Promise<boolean> =>
  basename(executable).toLowerCase() === 'cstrike.exe' &&
  (await isNextClientInstallation(dirname(executable)))
