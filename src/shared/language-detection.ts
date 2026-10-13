/** Select the first supported system preference; saved choices are handled by the caller. */
export const detectLanguage = <T extends string>(
  preferences: readonly string[],
  supported: readonly T[],
  fallback: T
): T => {
  for (const preference of preferences) {
    const code = preference.trim().toLowerCase().split(/[-_]/)[0]
    const normalized = code === 'fil' ? 'tl' : code === 'in' ? 'id' : code
    const match = supported.find((language) => language === normalized)
    if (match) return match
  }
  return fallback
}
