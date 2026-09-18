import { Gift, LoaderCircle, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { toast } from 'react-toastify'
import type { SkinGift, SkinGiftChoice } from '../../../../shared/skins'
import { ModalPortal } from '../../components/ui/ModalPortal'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { SkinModelThumbnail } from './SkinModelThumbnail'

type RevealStage = 'intro' | 'choices' | 'claiming' | 'claimed'

const errorMessage = (reason: unknown): string => {
  if (!(reason instanceof Error)) return 'Could not claim this gift.'
  return reason.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '').trim()
}

export function SkinGiftOverlay(): JSX.Element | null {
  const session = useAuthStore((state) => state.session)
  const status = useAuthStore((state) => state.status)
  const { t } = useTranslation()
  const [gift, setGift] = useState<SkinGift | null>(null)
  const [stage, setStage] = useState<RevealStage>('intro')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const requestInFlight = useRef(false)

  const loadGift = useCallback(async (): Promise<void> => {
    if (requestInFlight.current || !session || session.player.requiresUsernameSetup) return
    requestInFlight.current = true
    try {
      const pending = await window.api.skins.pendingGift()
      setGift(pending)
      if (pending) {
        setSelectedId(null)
        setStage('intro')
      }
    } catch (reason) {
      console.warn('[SkinGift] could not load pending gift', reason)
    } finally {
      requestInFlight.current = false
    }
  }, [session])

  useEffect(() => {
    if (status !== 'authenticated' || !session || session.player.requiresUsernameSetup) {
      setGift(null)
      return
    }
    void loadGift()
    const timer = window.setInterval(() => void loadGift(), 60_000)
    return () => window.clearInterval(timer)
  }, [loadGift, session, status])

  useEffect(() => {
    if (!gift || stage !== 'intro') return
    const timer = window.setTimeout(() => setStage('choices'), 1050)
    return () => window.clearTimeout(timer)
  }, [gift, stage])

  const claim = (choice: SkinGiftChoice): void => {
    if (!gift || choice.owned || stage !== 'choices') return
    setSelectedId(choice.id)
    setStage('claiming')
    void window.api.skins.claimGift(gift.id, choice.id)
      .then(() => {
        setStage('claimed')
        return new Promise<void>((resolve) => window.setTimeout(resolve, 1050))
      })
      .then(() => {
        setGift(null)
        setSelectedId(null)
        setStage('intro')
        void loadGift()
      })
      .catch((reason: unknown) => {
        toast.error(errorMessage(reason))
        setSelectedId(null)
        setStage('choices')
        if (errorMessage(reason).toLowerCase().includes('already own')) void loadGift()
      })
  }

  if (!gift) return null

  const showingChoices = stage !== 'intro'
  const finished = stage === 'claimed'

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-black/90 p-5 backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skin-gift-title"
      >
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-1000 ${
            showingChoices ? 'opacity-100' : 'opacity-40'
          }`}
          aria-hidden="true"
        >
          <div className="absolute top-1/2 left-1/2 size-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200/15 shadow-[0_0_120px_rgba(251,191,36,0.14)]" />
        </div>

        <section className="relative w-full max-w-5xl text-white">
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center text-center transition-all duration-700 ${
              stage === 'intro'
                ? 'scale-100 opacity-100'
                : 'pointer-events-none scale-125 opacity-0'
            }`}
          >
            <div className="relative grid size-24 place-items-center rounded-full border border-amber-200/30 bg-amber-300/10 shadow-[0_0_80px_rgba(251,191,36,0.28)]">
              <Gift className="size-11 text-amber-300" aria-hidden="true" />
              <Sparkles className="absolute -top-3 -right-4 size-7 text-amber-200" aria-hidden="true" />
            </div>
            <p className="mt-7 text-xs font-black tracking-[0.45em] text-amber-300 uppercase">
              {t('gift.arrived')}
            </p>
            <h2 id="skin-gift-title" className="mt-3 text-5xl font-black tracking-tight sm:text-7xl">
              {gift.kind === 'WELCOME' ? t('gift.welcomeTitle') : gift.title}
            </h2>
            <p className="mt-4 text-sm text-neutral-300">{t('gift.intro')}</p>
          </div>

          <div
            className={`transition-all duration-700 ${
              showingChoices ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
            }`}
          >
            <header className="mb-8 text-center">
              <p className="text-xs font-black tracking-[0.35em] text-amber-300 uppercase">
                {gift.kind === 'WELCOME' ? t('gift.newPlayerReward') : t('gift.specialReward')}
              </p>
              <h2 className="mt-2 text-4xl font-black sm:text-5xl">
                {gift.kind === 'WELCOME' ? t('gift.welcomeTitle') : gift.title}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
                {gift.kind === 'WELCOME' ? t('gift.welcomeMessage') : t('gift.intro')}
              </p>
            </header>

            <div className="grid gap-5 md:grid-cols-3">
              {gift.choices.map((choice, index) => {
                const selected = selectedId === choice.id
                const lockedOut = selectedId !== null && !selected
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={choice.owned || stage !== 'choices'}
                    onClick={() => claim(choice)}
                    style={{ transitionDelay: showingChoices ? `${index * 130}ms` : '0ms' }}
                    className={`group relative min-h-[25rem] overflow-hidden rounded-2xl border bg-neutral-950/95 p-5 text-left shadow-2xl transition-all duration-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 disabled:cursor-default ${
                      selected
                        ? 'z-10 scale-105 border-amber-300 shadow-[0_0_70px_rgba(251,191,36,0.35)]'
                        : lockedOut
                          ? 'scale-95 border-white/5 opacity-30 blur-[1px]'
                          : choice.owned
                            ? 'border-white/5 opacity-40'
                            : 'border-white/10 hover:-translate-y-2 hover:border-amber-300/60 hover:shadow-[0_18px_60px_rgba(251,191,36,0.16)]'
                    } ${
                      showingChoices ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
                    }`}
                  >
                    <div className="relative h-52 overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(245,158,11,0.18),_rgba(10,10,10,0.2)_70%)]">
                      <SkinModelThumbnail
                        cacheKey={`gift:v1:${choice.id}`}
                        skinId={choice.id}
                        modelKey={choice.id}
                        weaponKey={choice.weaponKey}
                        fallback={<span className="text-xs text-neutral-500">{t('gift.previewUnavailable')}</span>}
                        className="absolute inset-0"
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
                      <span className="absolute bottom-3 left-3 rounded bg-black/65 px-2 py-1 text-[10px] font-black tracking-[0.14em] text-amber-200 uppercase">
                        {choice.weaponKey}
                      </span>
                    </div>

                    <h3 className="mt-5 text-2xl font-bold">{choice.name}</h3>
                    <p className="mt-2 min-h-10 text-sm leading-5 text-neutral-400">
                      {choice.description ?? 'Custom weapon skin.'}
                    </p>

                    <div className="mt-6 flex h-11 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-sm font-black tracking-[0.12em] text-amber-200 uppercase transition group-hover:bg-amber-300/20">
                      {choice.owned
                        ? t('gift.owned')
                        : selected && stage === 'claiming'
                          ? <>
                              <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
                              {t('gift.claiming')}
                            </>
                          : selected && finished
                            ? t('gift.unlocked')
                            : t('gift.choose')}
                    </div>

                    {selected && finished && (
                      <div className="pointer-events-none absolute inset-0 grid place-items-center bg-amber-200/10 backdrop-blur-[1px]">
                        <div className="rounded-full border border-amber-200/60 bg-neutral-950/95 px-6 py-3 text-lg font-black tracking-[0.2em] text-amber-200 uppercase shadow-[0_0_70px_rgba(251,191,36,0.5)]">
                          {t('gift.yours')}
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </ModalPortal>
  )
}
