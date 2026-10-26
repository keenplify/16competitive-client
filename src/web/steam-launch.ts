import { parseManualConnectionDetails } from '../shared/matchmaking'

const STARTUP_WAIT_FRAMES = 20

export function webSteamLaunchUrl(connection: unknown): string {
  const { host, port, password, manualToken } = parseManualConnectionDetails(connection)
  // Classic Steam GoldSrc scans '+'/'-' anywhere in the raw launch text,
  // including inside quotes. Existing credentials must remain byte-for-byte
  // intact, so use the console fallback rather than altering a live password.
  if (password.includes('-') || manualToken.includes('-') || host.includes('-'))
    throw new Error('WEB_STEAM_CREDENTIALS_UNSUPPORTED')
  // GoldSrc startup can reset credentials after receiving Steam's arguments.
  // Yield first, then apply the activated Web Play identity and password just
  // before connecting. Send each credential only once to keep the handoff short
  // and avoid overflowing legacy startup command buffers. Running Steam games
  // do not support this full sequence; use the console fallback in that case.
  const waits = Array.from({ length: STARTUP_WAIT_FRAMES }, () => '+wait').join(' ')
  const args = `${waits} +setinfo _16c ${manualToken} +password "${password}" +connect ${host}:${port}`
  return `steam://run/10//${encodeURIComponent(args)}/`
}
