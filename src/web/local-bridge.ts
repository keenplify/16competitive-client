/** Loopback access starts only after a verified helper handoff. A failed fetch
 * suspends background traffic until the player explicitly reconnects, so a
 * dismissed browser device-access prompt is not immediately requested again.
 */
export class LocalBridge {
  private enabled = false

  isAuthorized(): boolean {
    return this.enabled
  }

  authorize(): void {
    this.enabled = true
  }

  async request(url: string, init: RequestInit): Promise<Response> {
    if (!this.enabled) throw new Error('Native helper bridge unavailable')
    try {
      return await fetch(url, init)
    } catch (error) {
      // Closing the voice stream is ordinary lifecycle cleanup.
      if (!init.signal?.aborted) this.enabled = false
      throw error
    }
  }
}
