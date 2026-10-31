/** Bound authenticated preview audio before handing it to a media decoder. */
export function isSkinPreviewAudio(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 44 || buffer.byteLength > 5 * 1024 * 1024) return false
  const bytes = new Uint8Array(buffer)
  return (
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WAVE'
  )
}
