export function parsePartnerLaunchTicket(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('ticket' in value)) throw new Error('INVALID_LAUNCH_TICKET')
  const ticket = value.ticket
  if (ticket === null) return null
  if (typeof ticket !== 'string' || !/^[a-f0-9]{32}$/.test(ticket)) throw new Error('INVALID_LAUNCH_TICKET')
  return ticket
}

export function partnerLaunchArguments(host: string, port: number, ticket: string | null): string[] {
  if (!/^[a-zA-Z0-9.-]{1,253}$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('INVALID_SERVER')
  if (ticket !== null && !/^[a-f0-9]{32}$/.test(ticket)) throw new Error('INVALID_LAUNCH_TICKET')
  return [...(ticket ? [...Array<string>(20).fill('+wait'), '+setinfo', '_16p', ticket] : []), '+connect', `${host}:${port}`]
}
