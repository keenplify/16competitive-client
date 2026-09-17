// Exact SHA-256 hashes for DLLs that are allowed to be loaded into hl.exe.
//
// Add one lowercase 64-character SHA-256 per entry. The module will still be
// reported in anti-cheat evidence, but it will not emit HL_INJECTED_DLL.
// Filename-only allowlisting is intentionally not supported because DLLs can
// be renamed trivially.
export const ALLOWED_HL_INJECTED_DLL_SHA256 = new Set<string>([
  // Example:
  // '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
])

export const isAllowedHlInjectedDll = (sha256: string | undefined): boolean =>
  Boolean(sha256 && ALLOWED_HL_INJECTED_DLL_SHA256.has(sha256.toLowerCase()))
