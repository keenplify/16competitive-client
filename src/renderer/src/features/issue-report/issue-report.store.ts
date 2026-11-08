import { useAuthStore } from '../auth/auth.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useCustomGamesStore } from '../matchmaking/custom-games.store'
import { create } from 'zustand'
import { toast } from 'react-toastify'
import type { CompatibilityPreview, ReportImage } from '../../../../shared/diagnostic-logs'
import labels from '../../../../shared/issue-report-translations.json'
import { useLanguageStore } from '../i18n/i18n'
import { getRendererDiagnosticLogs } from '../../diagnostic-logs'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
const text = (key: keyof typeof labels.en): string =>
  labels[useLanguageStore.getState().language][key]
let generation = 0
const consentKey = () => {
  const id = useAuthStore.getState().session?.player.id
  return id ? 'compatibility-report-consent-v1:' + id : null
}
const rememberedConsent = (): boolean | null => {
  const key = consentKey()
  try {
    const v = key && localStorage.getItem(key)
    return v === 'yes' ? true : null
  } catch {
    return null
  }
}
type Attachment = ReportImage & { id: string }
type State = {
  open: boolean
  description: string
  images: Attachment[]
  compatibility: CompatibilityPreview | null
  compatibilityPreview: CompatibilityPreview | null
  consentOpen: boolean
  rememberConsent: boolean
  savedConsent: boolean | null
  consentError: boolean
  openCompatibility: () => void
  decideCompatibility: (include: boolean) => void
  prepareCompatibility: (automatic?: boolean) => Promise<void>
  busy: boolean
  add: (files: File[]) => Promise<void>
  submit: () => Promise<void>
}
export const useIssueReport = create<State>((set, get) => ({
  open: false,
  description: '',
  images: [],
  compatibility: null,
  compatibilityPreview: null,
  consentOpen: false,
  rememberConsent: false,
  savedConsent: null,
  consentError: false,
  openCompatibility: () => {
    set({
      consentOpen: true,
      consentError: false,
      compatibilityPreview: null,
      rememberConsent: rememberedConsent() !== null
    })
    void get().prepareCompatibility()
  },
  decideCompatibility: (include) => {
    const preview = get().compatibilityPreview
    if (include && !preview) return
    const key = consentKey()
    try {
      if (key && include) {
        if (get().rememberConsent) localStorage.setItem(key, 'yes')
        else localStorage.removeItem(key)
      }
    } catch {
      toast.error(text('error'))
      return
    }
    set({
      compatibility: include ? preview : null,
      compatibilityPreview: null,
      consentOpen: false,
      savedConsent: rememberedConsent()
    })
  },
  prepareCompatibility: async (automatic = false) => {
    if (get().busy) return
    const current = generation
    set({ busy: true })
    const id = toast.loading(text('filesPreparing'))
    try {
      const compatibility = await window.api.diagnosticLogs.compatibility?.()
      if (!compatibility) throw new Error('unavailable')
      if (current !== generation) {
        toast.dismiss(id)
        return
      }
      set(automatic ? { compatibility } : { compatibilityPreview: compatibility })
      toast.update(id, {
        render: text('filesReady'),
        type: 'success',
        isLoading: false,
        autoClose: 3000
      })
    } catch {
      if (current === generation) set({ consentError: true, compatibility: null })
      if (current === generation)
        toast.update(id, {
          render: text('filesError'),
          type: 'error',
          isLoading: false,
          autoClose: 6000
        })
      else toast.dismiss(id)
    } finally {
      if (current === generation) set({ busy: false })
    }
  },
  busy: false,
  add: async (files) => {
    if (get().busy || !files.length) return
    const current = generation
    set({ busy: true })
    const id = toast.loading(text('preparing'))
    try {
      if (
        get().images.length + files.length > 3 ||
        files.some(
          (f) =>
            !['image/png', 'image/jpeg', 'image/webp'].includes(f.type) ||
            !f.size ||
            f.size > 2 * 1024 * 1024
        )
      )
        throw new Error('invalid')
      const images = await Promise.all(
        files.map(
          (file) =>
            new Promise<Attachment>((resolve, reject) => {
              const reader = new FileReader()
              reader.onerror = () => reject(new Error('invalid'))
              reader.onload = () =>
                resolve({
                  id: crypto.randomUUID(),
                  mime: file.type as ReportImage['mime'],
                  data: String(reader.result).split(',')[1]
                })
              reader.readAsDataURL(file)
            })
        )
      )
      if (current !== generation) {
        toast.dismiss(id)
        return
      }
      set((state) => ({ images: [...state.images, ...images] }))
      toast.update(id, {
        render: text('ready'),
        type: 'success',
        isLoading: false,
        autoClose: 2500
      })
    } catch {
      if (current !== generation) {
        toast.dismiss(id)
        return
      }
      toast.update(id, {
        render: text('invalid'),
        type: 'error',
        isLoading: false,
        autoClose: 6000
      })
    } finally {
      if (current === generation) set({ busy: false })
    }
  },
  submit: async () => {
    if (get().busy) return
    if (!get().description.trim()) {
      toast.error(text('empty'))
      return
    }
    const current = generation
    set({ busy: true })
    const id = toast.loading(text('sending'))
    try {
      const match = useMatchmakingStore.getState()
      const logs = getRendererDiagnosticLogs()
      const sync = await window.api.gameSettings.getAssetSyncStatus().catch(() => null)
      if (current !== generation) {
        toast.dismiss(id)
        return
      }
      logs.push(
        `[CatalogLoadingSnapshot] ${JSON.stringify({ page: useNavigationStore.getState().page, playView: useCustomGamesStore.getState().playView, status: sync?.status ?? 'unavailable', completedFiles: sync?.completedFiles ?? null, totalFiles: sync?.totalFiles ?? null })}`
      )
      await window.api.diagnosticLogs.report(
        get().description.trim(),
        logs,
        match.match?.matchId ?? match.connectionDetails?.matchId ?? match.completedMatch?.matchId,
        get().images.map(({ mime, data }) => ({ mime, data })),
        get().compatibility?.id
      )
      if (current !== generation) {
        toast.dismiss(id)
        return
      }
      set({ description: '', images: [], compatibility: null, open: false })
      toast.update(id, { render: text('sent'), type: 'success', isLoading: false, autoClose: 4000 })
    } catch (error) {
      if (current !== generation) {
        toast.dismiss(id)
        return
      }
      toast.update(id, {
        render: text(
          error instanceof Error && error.message.includes('COMPATIBILITY')
            ? 'filesError'
            : error instanceof Error && error.message.includes('INVALID_REPORT_IMAGES')
              ? 'invalid'
              : 'error'
        ),
        type: 'error',
        isLoading: false,
        autoClose: 6000
      })
    } finally {
      if (current === generation) set({ busy: false })
    }
  }
}))

useAuthStore.subscribe((state, previous) => {
  if (state.session?.player.id !== previous.session?.player.id) {
    generation++
    useIssueReport.setState({
      open: false,
      description: '',
      images: [],
      compatibility: null,
      compatibilityPreview: null,
      consentOpen: false,
      savedConsent: null,
      rememberConsent: false,
      consentError: false,
      busy: false
    })
  }
})

useIssueReport.subscribe((state, previous) => {
  if (state.open && !previous.open) {
    const savedConsent = rememberedConsent()
    useIssueReport.setState({ savedConsent, compatibility: null })
    if (window.api.diagnosticLogs.compatibility) {
      if (savedConsent === true) void state.prepareCompatibility(true)
      else state.openCompatibility()
    }
  }
})
