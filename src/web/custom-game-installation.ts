import type { NativeHelperSettings } from '../shared/native-helper-settings'

/** Installation readiness is a local UX hint, never a competitive entitlement. */
export async function customGameInstallationHeaders(
  read: () => Promise<NativeHelperSettings>
): Promise<Record<string, string>> {
  try {
    const settings = await read()
    return { 'x-cs13-installed': settings.cs13FolderPath ? 'true' : 'false' }
  } catch {
    return { 'x-cs13-installed': 'false' }
  }
}
