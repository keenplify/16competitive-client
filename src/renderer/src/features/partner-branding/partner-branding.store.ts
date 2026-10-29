import { create } from 'zustand'
import type { PartnerBranding } from '../../../../shared/partner-branding'

const preferenceKey = '16competitive.partner-theme-enabled'

const readPreference = (): boolean => {
  try {
    return window.localStorage.getItem(preferenceKey) !== 'false'
  } catch {
    return true
  }
}

interface PartnerBrandingState {
  accountId: string | null
  branding: PartnerBranding | null
  joinedBranding: PartnerBranding | null
  resolved: boolean
  enabled: boolean
  refresh: (accountId: string | null) => Promise<void>
  clear: () => void
  setEnabled: (enabled: boolean) => void
}

let requestSerial = 0

export const usePartnerBrandingStore = create<PartnerBrandingState>((set) => ({
  accountId: null,
  branding: null,
  joinedBranding: null,
  resolved: false,
  enabled: readPreference(),
  refresh: async (accountId) => {
    const serial = ++requestSerial
    set((state) =>
      state.accountId === accountId
        ? state
        : { accountId, branding: null, joinedBranding: null, resolved: false }
    )
    try {
      const joinedRequest =
        accountId && window.api.partnerBranding.getJoined
          ? window.api.partnerBranding.getJoined().catch(() => null)
          : Promise.resolve({ branding: null })
      const result = await window.api.partnerBranding.get()
      const joined = await joinedRequest
      if (serial === requestSerial)
        set({
          accountId,
          branding: result.branding,
          ...(joined ? { joinedBranding: joined.branding } : {}),
          resolved: true
        })
    } catch {
      // Keep the last verified palette during a transient connection failure.
      // A new account is always cleared before its own request starts.
      if (serial === requestSerial) set({ resolved: true })
    }
  },
  clear: () => {
    requestSerial++
    set({ accountId: null, branding: null, joinedBranding: null, resolved: false })
  },
  setEnabled: (enabled) => {
    try {
      window.localStorage.setItem(preferenceKey, String(enabled))
    } catch {
      // The current session still reflects the player's choice.
    }
    set({ enabled })
  }
}))
