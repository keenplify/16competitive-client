export function readyCheckRemainingMs(
  deadline: string,
  serverNow: string | undefined,
  currentNow = Date.now()
): number | null {
  const deadlineMs = Date.parse(deadline)
  const referenceMs = serverNow === undefined ? currentNow : Date.parse(serverNow)
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(referenceMs)) return null
  return deadlineMs - referenceMs
}
