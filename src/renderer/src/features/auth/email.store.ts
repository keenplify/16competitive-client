import { create } from 'zustand'
import type { EmailPreference } from '../../../../shared/email-preference'

interface EmailState {
  owner: string
  data: EmailPreference | null
  open: boolean
  failed: boolean
}

export const useEmailStore = create<EmailState>(() => ({ owner: '', data: null, open: false, failed: false }))
export async function loadEmail(owner: string, prompt: boolean): Promise<void> {
  useEmailStore.setState({ owner, data: null, failed: false, open: false })
  if (!owner) return
  try {
    const data = await window.api.auth.emailPreference({ action: 'status' })
    if (useEmailStore.getState().owner === owner)
      useEmailStore.setState({ data, open: prompt && (!data.verified || data.marketing === null) && !sessionStorage.getItem(`email-later:${owner}`) })
  } catch {
    if (useEmailStore.getState().owner === owner) useEmailStore.setState({ failed: true })
  }
}
