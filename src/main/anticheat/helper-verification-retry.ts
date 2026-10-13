const CONNECTION_GRACE_MS = 60_000
const SERVER_UPDATE_GRACE_MS = 120_000
let serverUpdateUntil = 0

/** Only authenticated backend restart notices can open this bounded window. */
export function noteHelperServerUpdate(now = Date.now()): void {
  if (now >= serverUpdateUntil) serverUpdateUntil = now + SERVER_UPDATE_GRACE_MS
}

export function helperApprovalRetryDeadline(now = Date.now()): number {
  return now + (now < serverUpdateUntil ? SERVER_UPDATE_GRACE_MS : CONNECTION_GRACE_MS)
}

/** Applies only after startup verification; local integrity/rejection errors stay fatal. */
export class HelperVerificationRetry {
  private deadline = 0

  retryConnectionFailure(now = Date.now()): boolean {
    this.deadline ||= helperApprovalRetryDeadline(now)
    return now < this.deadline
  }

  verified(): void {
    this.deadline = 0
  }
}
