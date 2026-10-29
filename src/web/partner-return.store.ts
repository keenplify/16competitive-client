import { create } from 'zustand'

// Keep the signed-out UI hidden until the browser leaves this document.
export const usePartnerReturnStore = create<{ redirecting: boolean }>(() => ({
  redirecting: false
}))
