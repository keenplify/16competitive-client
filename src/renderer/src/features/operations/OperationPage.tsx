import { Award, ChevronRight, Gift, LoaderCircle, LockKeyhole, Sparkles, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { OperationTier } from '../../../../shared/operations'
import { Button } from '../../components/ui/Button'
import { CurrencyIcon } from '../../components/CurrencyIcon'
import { SkinModelThumbnail } from '../skins/SkinModelThumbnail'
import waterBackground from '../../assets/operations/pixel-water-background.png'
import { ModelViewer } from '../../libs/web-hlmv/ui/ModelViewer'
import { presentationModelPath } from '../party/party-models'
import { useLobbyLoadoutStore } from '../party/lobby-loadout.store'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { useOperationStore } from './operation.store'

const safeImageUrl = (value: string | null): string | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

const rewardName = (tier: OperationTier): string => {
  if (tier.rewardType === 'SKIN') return tier.skin?.name ?? 'Weapon skin'
  if (tier.rewardType === 'POINTS') return `${(tier.amount ?? 0).toLocaleString()} Points`
  if (tier.rewardType === 'P_CASH') return `${(tier.amount ?? 0).toLocaleString()} Papa Cash`
  return tier.showcaseName ?? 'Showcase'
}

function RewardPreview({ tier }: { tier: OperationTier }): JSX.Element {
  if (tier.rewardType === 'SKIN' && tier.skinId && tier.skin?.weaponKey) {
    return (
      <SkinModelThumbnail
        cacheKey={`operation-tier:${tier.id}`}
        skinId={tier.skinId}
        modelKey={tier.skinId}
        weaponKey={tier.skin.weaponKey}
        fallback={<Gift className="size-8 text-neutral-500" aria-hidden="true" />}
        className="absolute inset-2"
      />
    )
  }

  if (tier.rewardType === 'POINTS' || tier.rewardType === 'P_CASH') {
    return (
      <div className="absolute inset-0 grid place-items-center">
        <CurrencyIcon
          currency={tier.rewardType}
          animated
          className={tier.isMajor ? 'size-24' : 'size-20'}
        />
      </div>
    )
  }

  const Icon = tier.rewardType === 'SHOWCASE' ? Award : Gift

  return (
    <div className="absolute inset-0 grid place-items-center">
      <span className="relative grid size-16 place-items-center rounded-full border border-white/15 bg-white/5 shadow-[0_0_35px_rgba(56,189,248,0.08)]">
        <Icon className="size-8 text-sky-200" aria-hidden="true" />
        {tier.rewardType === 'SHOWCASE' && (
          <Sparkles className="absolute -top-2 -right-2 size-5 text-amber-300" aria-hidden="true" />
        )}
      </span>
    </div>
  )
}

function TierCard({
  tier,
  displayedPoints,
  lastViewedPoints,
  currentPoints
}: {
  tier: OperationTier
  displayedPoints: number
  lastViewedPoints: number
  currentPoints: number
}): JSX.Element {
  const unlocked = displayedPoints >= tier.requiredPoints
  const newlyUnlocked =
    tier.requiredPoints > lastViewedPoints && tier.requiredPoints <= currentPoints && unlocked
  return (
    <div className="w-36 shrink-0 snap-start sm:w-40">
      <article
        className={twMerge(
          'relative flex h-44 w-full flex-col overflow-hidden border bg-neutral-950/90 shadow-xl transition-[transform,opacity,border-color,box-shadow] duration-500',
          tier.isMajor && 'border-amber-200/50',
          unlocked
            ? 'border-sky-300/60 opacity-100 shadow-[0_0_24px_rgba(56,189,248,0.16)]'
            : 'border-white/10 opacity-55 grayscale-[.45]',
          newlyUnlocked &&
            'operation-tier-pop border-amber-200/80 shadow-[0_0_38px_rgba(251,191,36,0.35)]'
        )}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,_rgba(14,116,144,0.22),_transparent_68%)]">
          <RewardPreview tier={tier} />
          {!unlocked && (
            <span className="absolute top-2 right-2 rounded bg-black/65 p-1.5 text-neutral-300">
              <LockKeyhole className="size-3.5" aria-hidden="true" />
            </span>
          )}
          {tier.isMajor && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded bg-amber-300/15 px-2 py-1 text-[9px] font-black tracking-[0.16em] text-amber-200 uppercase">
              <Star className="size-3 fill-current" aria-hidden="true" /> Major
            </span>
          )}
        </div>
        <div className="border-t border-white/10 px-3 py-2">
          <p className="truncate text-[10px] font-bold tracking-[0.12em] text-sky-300 uppercase">
            Tier {tier.tier}
          </p>
          <p
            className={twMerge(
              'mt-1 truncate font-semibold text-white',
              tier.isMajor ? 'text-sm' : 'text-xs'
            )}
          >
            {rewardName(tier)}
          </p>
        </div>
      </article>
      <p className="mt-2 text-center text-[10px] font-semibold tabular-nums text-neutral-400">
        {tier.requiredPoints.toLocaleString()} OP required
      </p>
    </div>
  )
}

export function OperationPage(): JSX.Element {
  const snapshot = useOperationStore((state) => state.snapshot)
  const status = useOperationStore((state) => state.mineStatus)
  const error = useOperationStore((state) => state.error)
  const loadMine = useOperationStore((state) => state.loadMine)
  const acknowledge = useOperationStore((state) => state.acknowledge)
  const operativeModel = useLobbyLoadoutStore((state) => state.playerModel)
  const installationPath = useGameSettingsStore((state) => state.savedPath)
  const [displayedPoints, setDisplayedPoints] = useState(0)
  const acknowledgedRef = useRef<string | null>(null)

  useEffect(() => {
    void loadMine()
  }, [loadMine])

  const operation = snapshot?.operation ?? null
  const progress = snapshot?.progress ?? null
  const maxPoints =
    operation && operation.tiers.length > 0
      ? operation.tiers[operation.tiers.length - 1]!.requiredPoints
      : 1
  const lastViewedPoints = progress?.lastViewedPoints ?? 0
  const currentPoints = progress?.points ?? 0

  useEffect(() => {
    if (!operation || !progress) return

    const start = Math.min(progress.lastViewedPoints, progress.points)
    const target = progress.points
    const shouldAcknowledge = target > start
    const acknowledgeKey = `${operation.id}:${target}`

    const acknowledgeOnce = (): void => {
      if (!shouldAcknowledge || acknowledgedRef.current === acknowledgeKey) return
      acknowledgedRef.current = acknowledgeKey
      void acknowledge(operation.id, target)
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = Math.min(3_200, Math.max(1_050, 950 + (target - start) * 2.5))
    const startedAt = performance.now()
    let animationFrame = 0

    const frame = (now: number): void => {
      const elapsed = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - elapsed, 3)
      setDisplayedPoints(Math.round(start + (target - start) * eased))
      if (elapsed < 1) {
        animationFrame = window.requestAnimationFrame(frame)
        return
      }
      acknowledgeOnce()
    }

    // The counting animation runs entirely inside requestAnimationFrame so the
    // effect body never calls setState synchronously (which would cascade renders).
    animationFrame = window.requestAnimationFrame((now) => {
      if (!shouldAcknowledge || reducedMotion) {
        setDisplayedPoints(target)
        acknowledgeOnce()
        return
      }
      frame(now)
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [acknowledge, operation, progress])

  const nextTier = useMemo(
    () => operation?.tiers.find((tier) => tier.requiredPoints > displayedPoints) ?? null,
    [displayedPoints, operation]
  )
  const progressPercent = Math.min(100, (displayedPoints / Math.max(1, maxPoints)) * 100)
  const isWaterTheme = /water/i.test(operation?.title ?? '')
  const heroUrl =
    safeImageUrl(operation?.heroUrl ?? null) ?? (isWaterTheme ? waterBackground : null)
  const logoUrl = safeImageUrl(operation?.logoUrl ?? null)

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex min-h-96 items-center justify-center" role="status">
        <LoaderCircle className="size-7 animate-spin text-sky-300" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <section className="py-12 text-center">
        <p className="text-sm text-rose-300">{error ?? 'Could not load Operation.'}</p>
        <Button className="mt-4" variant="ghost" onClick={() => void loadMine()}>
          Retry
        </Button>
      </section>
    )
  }

  if (!operation || !progress) {
    return (
      <section className="py-16 text-center">
        <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Operations</p>
        <h2 className="mt-3 text-2xl font-semibold">No active Operation</h2>
        <p className="mt-2 text-sm text-neutral-400">
          The next Operation will appear here when it becomes active.
        </p>
      </section>
    )
  }

  return (
    <section className="operation-enter mt-6 overflow-hidden border border-white/10 bg-neutral-950 shadow-2xl">
      <header className="relative min-h-[450px] overflow-hidden bg-[radial-gradient(circle_at_70%_35%,rgba(14,116,144,.28),transparent_52%)] lg:min-h-[520px]">
        {heroUrl && (
          <img
            src={heroUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
            draggable={false}
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,7,18,.96),rgba(3,7,18,.76)_42%,rgba(3,7,18,.24)_78%),linear-gradient(0deg,rgba(3,7,18,.94),transparent_65%)]" />
        <div className="operation-hero-scan pointer-events-none absolute inset-0 opacity-30" />
        <div className="absolute right-[-8%] bottom-[-12%] hidden h-[118%] w-[55%] drop-shadow-[-18px_20px_32px_rgba(0,0,0,.65)] md:block xl:right-[2%]">
          <ModelViewer
            modelPath={presentationModelPath(operativeModel)}
            sourceRevision={installationPath ?? 'unloaded'}
            maxFrameRate={30}
            cameraLocked
            className="h-full w-full"
          />
        </div>
        <div className="relative flex min-h-[450px] flex-col justify-between gap-8 p-6 sm:p-9 lg:min-h-[520px] lg:p-12">
          <div className="max-w-[55%] min-w-64">
            <div className="flex items-center gap-4">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt=""
                  className="size-20 object-contain drop-shadow-2xl"
                  draggable={false}
                />
              )}
              <div>
                <p className="text-xs font-black tracking-[0.24em] text-sky-300 uppercase">
                  Operation
                </p>
                <h2 className="mt-1 text-4xl font-black tracking-tight text-white uppercase sm:text-5xl">
                  {operation.title}
                </h2>
              </div>
            </div>
            {operation.description && (
              <p className="mt-5 max-w-xl text-sm leading-6 text-neutral-200/85">
                {operation.description}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-2 text-[10px] font-bold tracking-[0.14em] uppercase">
              <span className="border border-sky-300/30 bg-sky-300/10 px-2.5 py-1.5 text-sky-200">
                {operation.phase}
              </span>
              <span className="border border-white/15 bg-black/30 px-2.5 py-1.5 text-neutral-200">
                {operation.accessType === 'FREE'
                  ? 'Free Operation'
                  : `${operation.pricePCash?.toLocaleString() ?? 0} Papa Cash`}
              </span>
              <span className="border border-white/15 bg-black/30 px-2.5 py-1.5 text-neutral-200">
                Ends {new Date(operation.endsAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="w-fit min-w-56 border border-white/15 bg-black/55 px-5 py-4 backdrop-blur-sm">
            <p className="text-[10px] font-bold tracking-[0.18em] text-neutral-400 uppercase">
              Operation Points
            </p>
            <p className="mt-1 text-4xl font-black tabular-nums text-white">
              {displayedPoints.toLocaleString()}
              <span className="ml-2 text-sm text-sky-300">OP</span>
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              {nextTier
                ? `${Math.max(0, nextTier.requiredPoints - displayedPoints).toLocaleString()} OP to Tier ${nextTier.tier}`
                : 'Operation track complete'}
            </p>
          </div>
        </div>
      </header>

      <div className="relative border-t border-white/10 bg-neutral-950/95 p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.2em] text-sky-400 uppercase">
              Reward track
            </p>
            <h3 className="mt-1 text-xl font-semibold">Operation rewards</h3>
          </div>
          {currentPoints > lastViewedPoints && (
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-200">
              <Sparkles className="size-4" /> +{(currentPoints - lastViewedPoints).toLocaleString()}{' '}
              OP since last view
            </span>
          )}
        </div>
        <div
          className="mb-5 h-1 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Operation reward progress"
          aria-valuenow={displayedPoints}
          aria-valuemin={0}
          aria-valuemax={maxPoints}
        >
          <div
            className="operation-progress-sheen h-full bg-linear-to-r from-cyan-400 via-sky-300 to-blue-500 transition-[width] duration-75 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="relative">
          <div
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 pr-9"
            aria-label="Reward tiers"
          >
            {operation.tiers.map((tier) => (
              <TierCard
                key={tier.id}
                tier={tier}
                displayedPoints={displayedPoints}
                lastViewedPoints={lastViewedPoints}
                currentPoints={currentPoints}
              />
            ))}
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-linear-to-r from-transparent to-neutral-950 text-sky-300"
            aria-hidden="true"
          >
            <ChevronRight className="size-6" />
          </div>
        </div>
      </div>
    </section>
  )
}
