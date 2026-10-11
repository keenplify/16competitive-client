import { parseManualConnectionDetails } from '../shared/matchmaking'

const STARTUP_WAIT_FRAMES = 20

export function webSteamLaunchUrl(connection: unknown): string {
  const { host, port, password, manualToken } = parseManualConnectionDetails(connection)
  // GoldSrc startup can reset credentials after receiving Steam's arguments.
  // Yield first, then apply the activated Web Play identity and password just
  // before connecting. Send each credential only once to keep the handoff short
  // for Steam forwarding into an already running game.
  const waits = Array.from({ length: STARTUP_WAIT_FRAMES }, () => '+wait').join(' ')
  const args = `${waits} +setinfo _16c ${manualToken} +password ${password} +connect ${host}:${port}`
  return `steam://run/10//${encodeURIComponent(args)}/`
}
