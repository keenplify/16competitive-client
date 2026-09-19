import { Coins, LoaderCircle, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { toast } from 'react-toastify'
import type { SkinGift, SkinGiftChoice } from '../../../../shared/skins'
import { ModalPortal } from '../../components/ui/ModalPortal'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { SkinModelThumbnail } from './SkinModelThumbnail'

type RevealStage = 'intro' | 'choices' | 'claiming' | 'claimed'

const errorMessage = (reason: unknown): string => {
  if (!(reason instanceof Error)) return 'Could not claim this gift.'
  return reason.message
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
    .trim()
}

const MATCH_LIFECYCLE_STATUSES = [
  'match_found',
  'ready_check',
  'countdown',
  'starting_server',
  'server_ready'
]

const matchLifecycleActive = (queueStatus: string): boolean =>
  MATCH_LIFECYCLE_STATUSES.includes(queueStatus)

// Give the matchmaking socket a chance to replay a completed match before the
// overlay polls for the gift, so a freshly earned gift never flashes over the
// match results screen.
const GIFT_MATCH_RESULT_GRACE_MS = 800

export function SkinGiftOverlay(): JSX.Element | null {
  const session = useAuthStore((state) => state.session)
  const status = useAuthStore((state) => state.status)
  const setPoints = useAuthStore((state) => state.setPoints)
  const page = useNavigationStore((state) => state.page)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const connectionStatus = useMatchmakingStore((state) => state.connectionStatus)
  const completedMatch = useMatchmakingStore((state) => state.completedMatch)
  const { t } = useTranslation()
  const [gift, setGift] = useState<SkinGift | null>(null)
  const [stage, setStage] = useState<RevealStage>('intro')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dismissedGiftId, setDismissedGiftId] = useState<string | null>(null)
  const requestInFlight = useRef(false)
  const revealedGiftId = useRef<string | null>(null)

  const baseSafeToShow =
    status === 'authenticated' &&
    Boolean(session) &&
    !session?.player.requiresUsernameSetup &&
    page === 'lobby' &&
    completedMatch === null &&
    !matchLifecycleActive(queueStatus)

  const safeToShow = baseSafeToShow && connectionStatus === 'ready'

  const loadGift = useCallback(async (): Promise<void> => {
    if (requestInFlight.current || !safeToShow || !session) return
    requestInFlight.current = true
    try {
      const pending = await window.api.skins.pendingGift()
      const auth = useAuthStore.getState()
      const navigation = useNavigationStore.getState()
      const matchmaking = useMatchmakingStore.getState()
      if (
        auth.status !== 'authenticated' ||
        !auth.session ||
        auth.session.player.requiresUsernameSetup ||
        navigation.page !== 'lobby' ||
        matchmaking.completedMatch !== null ||
        matchmaking.connectionStatus !== 'ready' ||
        matchLifecycleActive(matchmaking.queueStatus)
      ) {
        return
      }
      if (pending?.id === dismissedGiftId) {
        setGift(null)
        return
      }
      setGift(pending)
      if (pending && revealedGiftId.current !== pending.id) {
        revealedGiftId.current = pending.id
        setSelectedId(null)
        setStage('intro')
      }
    } catch (reason) {
      console.warn('[SkinGift] could not load pending gift', reason)
    } finally {
      requestInFlight.current = false
    }
  }, [dismissedGiftId, safeToShow, session])

  useEffect(() => {
    if (status !== 'authenticated' || !session || session.player.requiresUsernameSetup) {
      setGift(null)
      setDismissedGiftId(null)
      revealedGiftId.current = null
      return
    }
    if (!safeToShow) {
      setGift(null)
      return
    }
    const initialTimer = window.setTimeout(() => void loadGift(), GIFT_MATCH_RESULT_GRACE_MS)
    const pollTimer = window.setInterval(() => void loadGift(), 60_000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(pollTimer)
    }
  }, [loadGift, safeToShow, session, status])

  useEffect(() => {
    if (status !== 'authenticated' || !session) return
    return window.api.matchmaking.onEvent((event) => {
      if (event.type === 'skin_gift_available') void loadGift()
    })
  }, [loadGift, session, status])

  useEffect(() => {
    if (!gift || stage !== 'intro') return
    const timer = window.setTimeout(() => setStage('choices'), 1700)
    return () => window.clearTimeout(timer)
  }, [gift, stage])

  const decideLater = (): void => {
    if (!gift || stage !== 'choices') return
    setDismissedGiftId(gift.id)
    setGift(null)
    setSelectedId(null)
    setStage('intro')
  }

  const claim = (choice: SkinGiftChoice): void => {
    if (!gift || choice.owned || stage !== 'choices') return
    setSelectedId(choice.id)
    setStage('claiming')
    void window.api.skins
      .claimGift(gift.id, choice.id)
      .then((result) => {
        if (typeof result.pointsGranted === 'number') {
          const currentPoints = useAuthStore.getState().session?.player.points ?? 0
          setPoints(currentPoints + result.pointsGranted)
        }
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

  if (!gift || !safeToShow) return null

  const showingChoices = stage !== 'intro'
  const finished = stage === 'claimed'

  return (
    <ModalPortal>
      <style>{`
        @keyframes giftBoxBounce {
          0% { transform: translateX(-50%) translateY(18px) scale(.78); opacity: 0; }
          22% { transform: translateX(-50%) translateY(-8px) scale(1.04); opacity: 1; }
          38% { transform: translateX(-50%) translateY(0) scale(.98); }
          52% { transform: translateX(-50%) translateY(-5px) rotate(-3deg); }
          64% { transform: translateX(-50%) translateY(-5px) rotate(3deg); }
          76% { transform: translateX(-50%) translateY(-3px) rotate(-2deg); }
          88% { transform: translateX(-50%) translateY(0) rotate(0deg); }
          100% { transform: translateX(-50%) translateY(0) scale(1); }
        }

        @keyframes giftLidPop {
          0%, 18% { transform: translateY(0) rotate(0deg) scale(1); }
          55% { transform: translateY(-27px) rotate(-8deg) scale(1.03); }
          100% { transform: translate(34px, -58px) rotate(24deg) scale(.94); opacity: .15; }
        }

        @keyframes giftBurst {
          0%, 38% { opacity: .2; transform: translate(-50%, -50%) scale(.55); }
          62% { opacity: .95; transform: translate(-50%, -50%) scale(1.3); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.8); }
        }

        @keyframes giftSparkle {
          0%, 35% { opacity: 0; transform: translateY(8px) scale(.4) rotate(-20deg); }
          58% { opacity: 1; transform: translateY(-8px) scale(1.25) rotate(8deg); }
          100% { opacity: 0; transform: translateY(-20px) scale(.7) rotate(22deg); }
        }

        @keyframes giftStar {
          0%, 42% { opacity: 0; transform: translateY(6px) scale(.3); }
          60% { opacity: 1; transform: translateY(-10px) scale(1.25); }
          100% { opacity: 0; transform: translateY(-30px) scale(.3); }
        }

        .gift-box { animation: giftBoxBounce 1.05s cubic-bezier(.2,.85,.25,1) both; transform-origin: center bottom; }
        .gift-box-lid { animation: giftLidPop .82s cubic-bezier(.2,.85,.25,1) .78s both; transform-origin: 18% 100%; }
        .gift-box-burst { animation: giftBurst 1.05s ease-out .55s both; }
        .gift-box-sparkle { animation: giftSparkle .9s ease-out .62s both; }
        .gift-box-star { animation: giftStar .88s ease-out both; }
        .gift-box-star-one { animation-delay: .62s; }
        .gift-box-star-two { animation-delay: .74s; }
        .gift-box-star-three { animation-delay: .84s; }

        @media (prefers-reduced-motion: reduce) {
          .gift-box,
          .gift-box-lid,
          .gift-box-burst,
          .gift-box-sparkle,
          .gift-box-star {
            animation-duration: .01ms !important;
            animation-delay: 0ms !important;
          }
        }
      `}</style>
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
            <div className="gift-box-scene relative h-36 w-44" aria-hidden="true">
              <div className="gift-box-burst absolute top-1/2 left-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/20 blur-2xl" />
              <Sparkles className="gift-box-sparkle absolute top-0 right-0 size-8 text-amber-200" />
              <span className="gift-box-star gift-box-star-one absolute top-7 left-0 size-2 rounded-full bg-amber-200" />
              <span className="gift-box-star gift-box-star-two absolute top-2 left-8 size-1.5 rounded-full bg-white" />
              <span className="gift-box-star gift-box-star-three absolute right-4 bottom-8 size-2 rounded-full bg-amber-300" />

              <div className="gift-box absolute bottom-2 left-1/2 h-28 w-32 -translate-x-1/2">
                <div className="gift-box-base absolute right-1 bottom-0 left-1 h-20 rounded-b-xl border border-amber-100/30 bg-linear-to-br from-amber-300 via-amber-400 to-amber-600 shadow-[0_18px_60px_rgba(251,191,36,0.35)]">
                  <div className="absolute inset-y-0 left-1/2 w-5 -translate-x-1/2 bg-red-600/90 shadow-[0_0_16px_rgba(220,38,38,0.35)]" />
                  <div className="absolute inset-x-0 top-3 h-px bg-white/20" />
                </div>

                <div className="gift-box-lid absolute top-2 -left-1 h-9 w-[8.5rem] rounded-lg border border-amber-100/40 bg-linear-to-b from-amber-200 to-amber-500 shadow-lg">
                  <div className="absolute inset-y-0 left-1/2 w-5 -translate-x-1/2 bg-red-600" />
                  <div className="gift-box-bow gift-box-bow-left absolute -top-6 left-[2.75rem] h-7 w-9 rounded-[100%_10%_100%_10%] border-4 border-red-500 bg-red-600/80" />
                  <div className="gift-box-bow gift-box-bow-right absolute -top-6 right-[2.75rem] h-7 w-9 rounded-[10%_100%_10%_100%] border-4 border-red-500 bg-red-600/80" />
                  <div className="absolute -top-3 left-1/2 size-6 -translate-x-1/2 rounded-full bg-red-600 shadow-md" />
                </div>
              </div>
            </div>
            <p className="mt-7 text-xs font-black tracking-[0.45em] text-amber-300 uppercase">
              {t('gift.arrived')}
            </p>
            <h2
              id="skin-gift-title"
              className="mt-3 text-5xl font-black tracking-tight sm:text-7xl"
            >
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
                const currency = choice.type !== 'SKIN'
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
                          ? 'scale-95 border-white/5 opacity-50 blur-[1px]'
                          : choice.owned
                            ? 'border-white/5 opacity-50'
                            : 'border-white/10 hover:-translate-y-2 hover:border-amber-300/60 hover:shadow-[0_18px_60px_rgba(251,191,36,0.16)]'
                    } ${
                      choice.owned
                        ? 'translate-y-0'
                        : showingChoices
                          ? 'translate-y-0 opacity-100'
                          : 'translate-y-12 opacity-0'
                    }`}
                  >
                    <div className="relative h-52 overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(245,158,11,0.18),_rgba(10,10,10,0.2)_70%)]">
                      {choice.type === 'SKIN' ? (
                        <>
                          <SkinModelThumbnail
                            cacheKey={`gift:v2:${choice.skinId}`}
                            skinId={choice.skinId}
                            modelKey={choice.skinId}
                            weaponKey={choice.weaponKey}
                            fallback={
                              <span className="text-xs text-neutral-500">
                                {t('gift.previewUnavailable')}
                              </span>
                            }
                            className="absolute inset-0"
                          />
                          <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
                          <span className="absolute bottom-3 left-3 rounded bg-black/65 px-2 py-1 text-[10px] font-black tracking-[0.14em] text-amber-200 uppercase">
                            {choice.weaponKey}
                          </span>
                        </>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(251,191,36,0.24),_rgba(10,10,10,0.15)_70%)] text-center">
                          <Coins
                            className="size-16 text-amber-300 drop-shadow-[0_0_24px_rgba(251,191,36,0.45)]"
                            aria-hidden="true"
                          />
                          <span className="mt-4 text-4xl font-black tabular-nums text-amber-200">
                            {(choice.type === 'POINTS'
                              ? choice.points
                              : choice.pCoins
                            ).toLocaleString()}
                          </span>
                          <span className="mt-1 text-xs font-black tracking-[0.18em] text-amber-100/75 uppercase">
                            {choice.type === 'POINTS' ? 'Points' : 'P Coins'}
                          </span>
                        </div>
                      )}
                    </div>

                    <h3 className="mt-5 text-2xl font-bold">{choice.name}</h3>
                    <p className="mt-2 min-h-10 text-sm leading-5 text-neutral-400">
                      {currency
                        ? t('gift.currencyReward')
                        : (choice.description ?? t('gift.skinReward'))}
                    </p>

                    <div
                      className={`mt-6 flex h-11 items-center justify-center rounded-lg border text-sm font-black tracking-[0.12em] uppercase transition ${
                        choice.owned
                          ? 'border-transparent bg-transparent text-neutral-500'
                          : 'border-amber-300/25 bg-amber-300/10 text-amber-200 group-hover:bg-amber-300/20'
                      }`}
                    >
                      {choice.owned ? (
                        t('gift.owned')
                      ) : selected && stage === 'claiming' ? (
                        <>
                          <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
                          {t('gift.claiming')}
                        </>
                      ) : selected && finished ? (
                        t('gift.unlocked')
                      ) : (
                        t('gift.choose')
                      )}
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

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                disabled={stage !== 'choices'}
                onClick={decideLater}
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-neutral-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-40"
              >
                {t('gift.decideLater')}
              </button>
            </div>
          </div>
        </section>
      </div>
    </ModalPortal>
  )
}
