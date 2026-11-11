import { launcherAudio } from '../audio/audio.manager'
import { rewardRarity } from './reward-rarity'
import { skinRarityOrder } from '../skins/skin-rarity'
import { useEffectiveLauncherTheme } from '../settings/use-effective-launcher-theme'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react'
import { ArrowRight, Check, Gift, LoaderCircle, ShieldCheck } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { Button } from '../../components/ui/Button'
import { CurrencyIcon } from '../../components/CurrencyIcon'
import { SkinModelThumbnail } from '../skins/SkinModelThumbnail'
import { ensureStickerArtwork, useInventoryStore } from '../inventory/inventory.store'
import { useTranslation } from '../i18n/i18n'
import { combineRewards, type RewardReceipt } from '../../../../shared/reward-inbox'
import translations from './reward-translations.json'
import './reward-reveal.css'

function CountUp({ amount }: { amount: number }): JSX.Element {
  const [display, setDisplay] = useState(amount)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / 600)
      setDisplay(Math.round(amount * (1 - (1 - progress) ** 3)))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [amount])
  return (
    <span className="tabular-nums" aria-label={`+${amount.toLocaleString()}`}>
      <span aria-hidden="true">+{display.toLocaleString()}</span>
    </span>
  )
}

function PrizeArtwork({ reward }: { reward: RewardReceipt }): JSX.Element {
  const image = useInventoryStore((state) =>
    reward.imagePath ? state.images[reward.imagePath] : undefined
  )
  useEffect(() => {
    if (reward.type === 'STICKER' && reward.imagePath)
      void ensureStickerArtwork(reward.imagePath).catch(() => undefined)
  }, [reward.type, reward.imagePath])
  if (reward.type === 'POINTS' || reward.type === 'P_CASH')
    return <CurrencyIcon currency={reward.type} className="reward-coin" />
  if (reward.type === 'SKIN' && reward.weaponKey)
    return (
      <SkinModelThumbnail
        cacheKey={`reward:${reward.itemId}`}
        weaponKey={reward.weaponKey}
        skinId={reward.itemId}
        showAppliedStickers={false}
        previewRotation={reward.previewRotation ?? undefined}
        previewHiddenTextures={reward.previewHiddenTextures ?? undefined}
        fallback={<Gift className="size-20 text-amber-100" />}
        className="h-36 w-full"
      />
    )
  if (image) return <img className="size-28 object-contain" alt="" src={image} />
  return reward.type === 'SHOWCASE' ? (
    <ShieldCheck className="size-24 text-violet-200" strokeWidth={1} />
  ) : (
    <Gift className="size-24 text-amber-100" strokeWidth={1} />
  )
}

function PrizeCard({
  reward,
  revealed,
  className
}: {
  reward: RewardReceipt
  revealed: boolean
  className?: string
}): JSX.Element {
  const { language } = useTranslation()
  const text = translations[language]
  const currency = reward.type === 'POINTS' || reward.type === 'P_CASH'
  const card = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = card.current
    const list = element?.parentElement
    if (!revealed || !element || !list) return
    const bounds = element.getBoundingClientRect()
    const viewport = list.getBoundingClientRect()
    if (bounds.bottom > viewport.bottom)
      list.scrollTo({
        top: list.scrollTop + bounds.bottom - viewport.bottom + 12,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth'
      })
  }, [revealed])
  return (
    <article
      ref={card}
      className={twMerge(
        'reward-prize',
        currency ? 'reward-prize-currency' : 'reward-prize-item',
        className
      )}
      data-rarity={rewardRarity(reward)}
      data-revealed={revealed}
      aria-hidden={!revealed}
    >
      <div className="reward-art" aria-hidden="true">
        <div className="reward-halo" />
        <PrizeArtwork reward={reward} />
      </div>
      <div className="reward-prize-copy">
        {currency ? (
          <>
            <div className="reward-amount">
              {revealed ? (
                <CountUp amount={reward.amount} />
              ) : (
                <span>+{reward.amount.toLocaleString()}</span>
              )}
            </div>
            <p className="reward-kind">{text[reward.type]}</p>
          </>
        ) : (
          <>
            <p className="reward-item-name">{reward.name ?? text[reward.type]}</p>
            <p className="reward-kind">
              {text[reward.type]}
              {reward.amount > 1 ? ` ×${reward.amount}` : ''}
            </p>
          </>
        )}
      </div>
    </article>
  )
}

export function RewardReveal({
  receipts,
  active = true,
  busy,
  onContinue,
  className
}: {
  receipts: RewardReceipt[]
  active?: boolean
  busy: boolean
  onContinue: () => void
  className?: string
}): JSX.Element {
  const { language } = useTranslation()
  const text = translations[language]
  const theme = useEffectiveLauncherTheme()
  const prizes = useMemo(
    () =>
      combineRewards(receipts).sort(
        (a, b) =>
          skinRarityOrder.indexOf(rewardRarity(a)) - skinRarityOrder.indexOf(rewardRarity(b))
      ),
    [receipts]
  )
  const [exposed, setExposed] = useState(0)
  useEffect(() => {
    if (!active || exposed >= prizes.length) return
    const timer = window.setTimeout(
      () => {
        launcherAudio.playSfx(`reward${rewardRarity(prizes[exposed])}`)
        setExposed(exposed + 1)
      },
      exposed === 0 ? 250 : 850
    )
    return () => clearTimeout(timer)
  }, [active, exposed, prizes])
  const ready = exposed >= prizes.length
  return (
    <ModalDialog
      open={active}
      vguiTitlebar={theme === 'vgui2'}
      label={text.title}
      labelledBy="reward-reveal-title"
      onClose={() => {
        if (!busy && ready) onContinue()
      }}
      className={twMerge('reward-reveal', theme === 'vgui2' && 'reward-reveal-vgui2', className)}
    >
      <div className="reward-atmosphere" aria-hidden="true" />
      <div className="reward-sparks" aria-hidden="true">
        {Array.from({ length: 16 }, (_, i) => (
          <i
            key={i}
            style={
              { '--spark-x': `${(i * 37) % 100}%`, '--spark-delay': `${i * 55}ms` } as CSSProperties
            }
          />
        ))}
      </div>
      <header className="reward-heading">
        <h2 id="reward-reveal-title">{text.title}</h2>
        <div className="reward-title-rule" />
      </header>
      <div className="reward-prizes" data-single={prizes.length === 1}>
        {prizes.map((reward, index) => (
          <PrizeCard
            key={`${reward.type}:${reward.itemId}:${reward.imagePath}`}
            reward={reward}
            revealed={index < exposed}
          />
        ))}
      </div>
      <footer className="reward-footer">
        <p>
          <Check className="size-3.5" />
          {text.saved}
        </p>
        <Button className="reward-continue" onClick={onContinue} disabled={busy || !ready}>
          <span className={busy ? 'invisible' : undefined}>{text.continue}</span>
          {busy ? (
            <LoaderCircle className="absolute size-5 animate-spin" aria-label={text.saving} />
          ) : (
            <ArrowRight className="size-4" />
          )}
        </Button>
      </footer>
    </ModalDialog>
  )
}
