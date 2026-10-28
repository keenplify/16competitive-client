import { create } from 'zustand'

type HelperStatus =
  'idle' | 'checking' | 'electron' | 'rust' | 'outdated-electron' | 'outdated-rust' | 'unavailable'

interface WebHelperPromptState {
  awaitingInstall: boolean
  awaitInstall: () => void
  nativeReady: boolean
  competitiveReady: boolean
  onboardingOpen: boolean
  open: boolean
  setupOpen: boolean
  setupCommand: string | null
  setupArch: 'x64' | 'arm64'
  status: HelperStatus
  successSequence: number
  accountId: string | null
  onContinue: (() => void) | null
  show: (onContinue?: () => void) => void
  close: () => void
  closeSetup: () => void
  syncAccount: (accountId: string | null) => void
  checkNative: () => Promise<HelperStatus>
  refreshReadiness: () => Promise<void>
  prepareSetup: (arch?: 'x64' | 'arm64') => Promise<void>
  renewSetupCommand: () => Promise<string | null>
}

let generation = 0
let pendingCheck: Promise<HelperStatus> | null = null

export const useWebHelperPromptStore = create<WebHelperPromptState>((set, get) => {
  const startSetup = async (
    arch: 'x64' | 'arm64'
  ): Promise<{ command: string; completion: Promise<void> } | null> => {
    cancelSetup()
    const current = generation
    set({
      awaitingInstall: true,
      setupOpen: true,
      setupArch: arch,
      setupCommand: null,
      status: 'checking'
    })
    try {
      const setup = await window.api.matchmaking.createNativeHelperSetup?.()
      if (current !== generation || !get().setupOpen) return null
      if (!setup) throw new Error('Native helper setup unavailable')
      const link = new URL(setup.checkUrl)
      if (link.protocol !== 'competitive16-helper:' || /['\n\r]/.test(setup.checkUrl))
        throw new Error('Invalid helper setup link')
      const command = `cd ~/Downloads\nhelper="$(find . -maxdepth 1 -type f -regextype posix-extended -regex './competitive16-web-helper-linux${arch === 'arm64' ? '-arm64' : ''}(\\([0-9]+\\))?' -printf '%T@ %f\\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"\nchmod +x -- "$helper" && "./$helper" '${setup.checkUrl}'`
      set({ setupCommand: command })
      const completion = (async () => {
        try {
          const result = await window.api.matchmaking.waitForNativeHelperSetup?.(setup)
          if (current !== generation || !get().setupOpen) return
          if (result === 'rust') {
            await ready()
          } else if (result === 'outdated-rust') {
            set({ status: result })
          } else if (Date.now() >= Date.parse(setup.expiresAt)) {
            void startSetup(arch)
          } else {
            set({ status: 'unavailable' })
          }
        } catch {
          if (current === generation) set({ status: 'unavailable' })
        }
      })()
      return { command, completion }
    } catch {
      if (current === generation) set({ status: 'unavailable' })
      return null
    }
  }
  const ready = async (): Promise<void> => {
    const run = generation
    const accountId = get().accountId
    if (get().accountId !== accountId || run !== generation) return
    const announce = get().awaitingInstall || get().setupOpen
    set({
      awaitingInstall: false,
      nativeReady: true,
      competitiveReady: false,
      status: 'rust',
      onboardingOpen: get().onboardingOpen && announce,
      open: false,
      onContinue: null,
      setupOpen: false,
      setupCommand: null,
      successSequence: get().successSequence + (announce ? 1 : 0)
    })
    // The handoff already proved that the installed helper answered. The
    // on-demand game runtime may still be downloading, so load it separately.
    void get()
      .refreshReadiness()
      .catch(() => undefined)
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
    onboardingOpen: false,
    open: false,
    setupOpen: false,
    setupCommand: null,
    setupArch: 'x64',
    status: 'idle',
    successSequence: 0,
    refreshReadiness: async () => {
      const accountId = get().accountId
      const value = await window.api.matchmaking.nativeHelperReadiness?.()
      if (get().accountId === accountId) set({ competitiveReady: value?.competitiveReady === true })
    },
    accountId: null,
    onContinue: null,
    show: (onContinue) => set({ open: true, onContinue: onContinue ?? null }),
    close: () => {
      cancelSetup()
      set({
        awaitingInstall: false,
        onboardingOpen: false,
        open: false,
        onContinue: null,
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
        onContinue: null,
        awaitingInstall: false,
        nativeReady: false,
        competitiveReady: false,
        onboardingOpen: accountId !== null,
        open: false,
        setupOpen: false,
        setupCommand: null,
        status: 'idle'
      })
      if (accountId) {
        // Show onboarding on login while the native protocol check runs.
        // A previously verified helper skips it in ready().
        void get().checkNative()
      }
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
    prepareSetup: async (arch = 'x64') => {
      const setup = await startSetup(arch)
      await setup?.completion
    },
    renewSetupCommand: async () => (await startSetup(get().setupArch))?.command ?? null
  }
})
