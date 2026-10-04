/** Update only our URL association, preserving unrelated desktop preferences. */
export function setDefaultMimeHandler(contents: string, mime: string, desktopId: string): string {
  const lines = contents.replace(/\r\n/g, '\n').split('\n')
  let inDefaults = false
  let foundSection = false
  let inserted = false
  const result: string[] = []
  for (const line of lines) {
    if (/^\s*\[.*\]\s*$/.test(line)) {
      if (inDefaults && !inserted) {
        result.push(`${mime}=${desktopId};`)
        inserted = true
      }
      inDefaults = line.trim() === '[Default Applications]'
      foundSection ||= inDefaults
    }
    if (inDefaults && line.trim().startsWith(`${mime}=`)) {
      if (!inserted) result.push(`${mime}=${desktopId};`)
      inserted = true
    } else result.push(line)
  }
  if (!foundSection) result.push('[Default Applications]')
  if (!inserted) result.push(`${mime}=${desktopId};`)
  return `${result.join('\n').trimEnd()}\n`
}
