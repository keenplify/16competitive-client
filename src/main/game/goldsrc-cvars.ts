import { getSessionToken } from '../auth'
import { resolveServiceApiUrl } from '../matchmaking-regions'
import { parseGoldsrcCvars } from '../../shared/goldsrc-cvars'

export async function accountGoldsrcCvars(update?: {
  cvars: unknown
}): Promise<Record<string, number>> {
  const token = getSessionToken()
  if (!token) throw new Error('UNAUTHORIZED')
  const base = await resolveServiceApiUrl()
  const response = await fetch(`${base}/auth/goldsrc-cvars/`, {
    method: update ? 'PUT' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: update ? JSON.stringify({ cvars: parseGoldsrcCvars(update.cvars) }) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(8000)
  })
  if (!response.ok) throw new Error('CVARS_UNAVAILABLE')
  const body = await response.json()
  if (getSessionToken() !== token) throw new Error('ACCOUNT_CHANGED')
  return parseGoldsrcCvars(body.cvars)
}

export async function loadGoldsrcLaunchArgs(): Promise<string[]> {
  if (!getSessionToken()) return []
  try {
    const cvars = await accountGoldsrcCvars()
    return Object.entries(cvars).flatMap(([name, value]) => ['+' + name, String(value)])
  } catch {
    console.warn('[GameLaunch] GoldSrc account settings unavailable for this launch')
    return []
  }
}
