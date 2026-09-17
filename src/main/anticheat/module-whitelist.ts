// The backend is the single authority for injected-DLL SHA-256 allowlisting.
// The client must report every non-baseline DLL so the server can decide
// whether the hash is allowlisted, suspicious, or a known cheat signature.
export const isAllowedHlInjectedDll = (sha256?: string): boolean => {
  void sha256
  return false
}
