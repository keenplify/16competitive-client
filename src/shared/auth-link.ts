// This link only brings the launcher forward. Sessions still come from authenticated polling.
export function isAuthReturnLink(value: string): boolean {
  return value === 'competitive16://auth-complete' || value === 'competitive16://auth-complete/'
}
