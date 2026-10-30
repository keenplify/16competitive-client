/** A failed local/custom preview must not prevent the bundled character rendering. */
export async function loadPlayerPreview<T>(
  readSelected: () => Promise<ArrayBuffer>,
  readBundled: () => Promise<ArrayBuffer>,
  prepare: (buffer: ArrayBuffer) => T | Promise<T>
): Promise<T> {
  try {
    return await prepare(await readSelected())
  } catch {
    return prepare(await readBundled())
  }
}
