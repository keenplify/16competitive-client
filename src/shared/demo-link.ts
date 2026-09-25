export const DEMO_PROTOCOL = 'competitive16'
export function parseDemoLink(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      url.protocol !== `${DEMO_PROTOCOL}:` ||
      url.hostname !== 'play-demo' ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return null
    if (
      [...url.searchParams.keys()].some((key) => key !== 'recordingId') ||
      url.searchParams.getAll('recordingId').length !== 1
    )
      return null
    const id = url.searchParams.get('recordingId') ?? ''
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ? id : null
  } catch {
    return null
  }
}
