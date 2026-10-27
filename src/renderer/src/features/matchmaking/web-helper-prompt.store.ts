import { create } from 'zustand'

type HelperStatus =
  'idle' | 'checking' | 'electron' | 'rust' | 'outdated-electron' | 'outdated-rust' | 'unavailable'

interface WebHelperPromptState {
  awaitingInstall: boolean
  awaitInstall: () => void
  nativeReady: boolean
  competitiveReady: boolean
  open: boolean
  setupOpen: boolean
  setupCommand: string | null
  status: HelperStatus
  successSequence: number
  accountId: string | null
  show: () => void
  close: () => void
  closeSetup: () => void
  syncAccount: (accountId: string | null) => void
  checkNative: () => Promise<HelperStatus>
  refreshReadiness: () => Promise<void>
  prepareSetup: () => Promise<void>
}

let generation = 0
let pendingCheck: Promise<HelperStatus> | null = null

export const useWebHelperPromptStore = create<WebHelperPromptState>((set, get) => {
  const ready = async (): Promise<void> => {
    const run = generation
    const accountId = get().accountId
    const capability = await window.api.matchmaking.nativeHelperReadiness?.()
    if (get().accountId !== accountId || run !== generation) return
    const announce = get().awaitingInstall || get().setupOpen
    set({
      awaitingInstall: false,
      nativeReady: true,
      competitiveReady: capability?.competitiveReady === true,
      status: 'rust',
      open: false,
      setupOpen: false,
      setupCommand: null,
      successSequence: get().successSequence + (announce ? 1 : 0)
    })
  }
  const cancelSetup = (): void => {
    generation++
    pendingCheck = null
    window.api.matchmaking.cancelNativeHelperSetup?.()
  }
  return {
    awaitingInstall: false,
    awaitInstall: () => set({ awaitingInstall: true }),
    nativeReady: false,
    competitiveReady: false,
    open: false,
    setupOpen: false,
    setupCommand: null,
    status: 'idle',
    successSequence: 0,
    refreshReadiness: async () => {
      const accountId = get().accountId
      const value = await window.api.matchmaking.nativeHelperReadiness?.()
      if (get().accountId === accountId) set({ competitiveReady: value?.competitiveReady === true })
    },
    accountId: null,
    show: () => set({ open: true }),
    close: () => {
      cancelSetup()
      set({
        awaitingInstall: false,
        open: false,
        setupOpen: false,
        setupCommand: null,
        ...(get().status === 'checking' ? { status: 'idle' } : {})
      })
    },
    closeSetup: () => {
      cancelSetup()
      set({
        setupOpen: false,
        setupCommand: null,
        ...(get().status === 'checking' ? { status: 'idle' } : {})
      })
    },
    syncAccount: (accountId) => {
      if (get().accountId === accountId) return
      cancelSetup()
      set({
        accountId,
        awaitingInstall: false,
        nativeReady: false,
        competitiveReady: false,
        open: false,
        setupOpen: false,
        setupCommand: null,
        status: 'idle'
      })
      if (accountId) void get().checkNative()
    },
    checkNative: () => {
      if (pendingCheck) return pendingCheck
      const current = generation
      set({ status: 'checking' })
      const operation = (async (): Promise<HelperStatus> => {
        let status: HelperStatus
        try {
          const result = await window.api.matchmaking.checkLocalLauncher?.('rust')
          status = result === 'rust' || result === 'outdated-rust' ? result : 'unavailable'
        } catch {
          status = 'unavailable'
        }
        if (current === generation) {
          if (status === 'rust') {
            try {
              await ready()
            } catch {
              status = 'unavailable'
              if (current === generation) set({ status, competitiveReady: false })
            }
          } else set({ status, competitiveReady: false })
        }
        return current === generation ? status : 'idle'
      })()
      pendingCheck = operation
      void operation.finally(() => {
        if (pendingCheck === operation) pendingCheck = null
      })
      return operation
    },
    prepareSetup: async () => {
      cancelSetup()
      const current = generation
      set({ setupOpen: true, setupCommand: null, status: 'checking' })
      try {
        while (current === generation && get().setupOpen) {
          const setup = await window.api.matchmaking.createNativeHelperSetup?.()
          if (current !== generation || !get().setupOpen) return
          if (!setup) throw new Error('Native helper setup unavailable')
          // The URL is generated and validated by the web API. Quote the entire
          // argument so its ampersand cannot split the terminal command.
          const link = new URL(setup.checkUrl)
          if (link.protocol !== 'competitive16-helper:' || /['\n\r]/.test(setup.checkUrl))
            throw new Error('Invalid helper setup link')
          set({
            // Browsers append (1), (2), ... when an older download has the
            // same name. Select the newest completed helper in this folder.
            setupCommand: `cd ~/Downloads\nhelper="$(find . -maxdepth 1 -type f -regextype posix-extended -regex './competitive16-web-helper-linux(\\([0-9]+\\))?' -printf '%T@ %f\\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"\nchmod +x -- "$helper" && "./$helper" '${setup.checkUrl}'`
          })
          const result = await window.api.matchmaking.waitForNativeHelperSetup?.(setup)
          if (current !== generation || !get().setupOpen) return
          if (result === 'rust') {
            await ready()
            return
          }
          if (result === 'outdated-rust') {
            set({ status: result })
            return
          }
          // Renew the short-lived command only after its verification expires.
          if (Date.now() < Date.parse(setup.expiresAt)) throw new Error('Helper setup interrupted')
        }
      } catch {
        if (current === generation) set({ status: 'unavailable' })
      }
    }
  }
})
