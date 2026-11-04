import { nativeImage } from 'electron'
import { getSessionToken, readStoredSessionToken } from '../auth'
import { API_BASE_URL } from '../config'
import { getPartnerBranding } from '../partner-branding'
import { parsePartnerBranding } from '../../shared/partner-branding'

const MAX_LOGO_BYTES = 4 * 1024 * 1024
const currentToken = async (): Promise<string | null> =>
  getSessionToken() ?? (await readStoredSessionToken())

/** Fetch only validated community artwork; never expose credentials or remote URLs to the splash. */
export async function loadStartupPartnerLogo(): Promise<{
  dataUrl: string
  name: string
} | null> {
  const token = await currentToken()
  const signal = AbortSignal.timeout(4_000)
  const result = token
    ? await fetch(new URL('/partners/branding/me', API_BASE_URL), {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'error',
        signal
      }).then(async (response) => {
        if (!response.ok) throw new Error('Community branding unavailable')
        return parsePartnerBranding(await response.json(), API_BASE_URL)
      })
    : await getPartnerBranding()
  const branding = result.branding
  if (!branding?.logoUrl) return null
  const response = await fetch(branding.logoUrl, { redirect: 'error', signal })
  if (!response.ok || !response.body) throw new Error('Community logo unavailable')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > MAX_LOGO_BYTES) throw new Error('Community logo too large')
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  if ((await currentToken()) !== token) return null
  const image = nativeImage.createFromBuffer(Buffer.concat(chunks))
  const dimensions = image.getSize()
  if (image.isEmpty() || dimensions.width > 4096 || dimensions.height > 4096)
    throw new Error('Invalid community logo')
  const resized = image.resize(
    dimensions.width >= dimensions.height ? { width: 512 } : { height: 512 }
  )
  return {
    dataUrl: resized.toDataURL(),
    name: branding.communityName ?? '1.6 Competitive'
  }
}
