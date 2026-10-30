import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { LegacyGameService } from './game/legacy-game-service'
import { connectPartnerServer } from './partner-servers'

/** Only server IDs cross the bridge. The authenticated API supplies the endpoint and ticket. */
export async function launchNativePartnerServer(dataRoot: string, input: unknown): Promise<void> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid partner launch')
  const value = input as Record<string, unknown>
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
  if (
    typeof value.serverId !== 'string' ||
    !uuid.test(value.serverId) ||
    Object.keys(value).some((key) => !['serverId', 'groupId', 'communityId'].includes(key)) ||
    [value.groupId, value.communityId].some(
      (id) => id != null && (typeof id !== 'string' || !uuid.test(id))
    )
  )
    throw new Error('Invalid partner launch')
  const bytes = await readFile(join(dataRoot, 'web-helper.json'))
  if (bytes.length > 16384) throw new Error('Invalid helper preferences')
  const prefs: unknown = JSON.parse(bytes.toString('utf8'))
  const folder = prefs && typeof prefs === 'object' && 'cs13' in prefs ? prefs.cs13 : null
  if (typeof folder !== 'string' || !isAbsolute(folder)) throw new Error('INSTALLATION_REQUIRED')
  const result = await new LegacyGameService({
    settingsPath: join(app.getPath('userData'), 'cs13-installation.json'),
    platform: process.platform,
    chooseFolder: async () => folder,
    isBusy: () => false,
    launch: async () => undefined
  }).choose()
  if (!result.ok || !result.value?.installation) throw new Error('INSTALLATION_REQUIRED')
  await connectPartnerServer(
    value.serverId,
    value.groupId ?? undefined,
    (value.communityId as string | undefined) ?? undefined
  )
}
