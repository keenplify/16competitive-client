import { create } from 'zustand'

// Retain the approved destination after logout clears the partner session.
export const usePartnerReturnStore = create<{
  ready: boolean
  redirecting: boolean
  returnUrl: string | null
  partnerName: string
}>(() => ({ ready: false, redirecting: false, returnUrl: null, partnerName: '' }))
