import type {
  NativeHelperSettings,
  NativeHelperSettingsRequest
} from '../../../../shared/native-helper-settings'

type SettingsApi = (request: NativeHelperSettingsRequest) => Promise<NativeHelperSettings>

/** Refresh an expired local bridge before sending a picker or settings mutation. */
export async function requestNativeHelperSettings(
  value: NativeHelperSettingsRequest,
  api: SettingsApi,
  reconnect: () => Promise<string>,
  delay: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
): Promise<NativeHelperSettings> {
  let current: NativeHelperSettings
  try {
    current = await api({ action: 'get' })
  } catch (error) {
    if ((await reconnect()) !== 'rust') throw error
    let recovered: NativeHelperSettings | null = null
    for (let attempt = 0; attempt < 50; attempt++) {
      await delay(100)
      try {
        recovered = await api({ action: 'get' })
        break
      } catch {
        // Verification can complete just before the bridge starts listening.
      }
    }
    if (!recovered) throw error
    current = recovered
  }
  return value.action === 'get' ? current : api(value)
}
