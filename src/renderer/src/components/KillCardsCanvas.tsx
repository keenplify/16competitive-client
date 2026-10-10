import { createElement, useEffect, useRef, type JSX } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Bomb, Skull, Spade } from 'lucide-react'
import { twMerge } from 'tailwind-merge'

interface KillCardsCanvasProps {
  count: number
  mode: 'C' | 'F'
  aceAt: number | null
  side: 'CT' | 'T' | 'F'
  kinds?: ('skull' | 'grenade')[]
  lightweight?: boolean
  className?: string
}

const WIDTH = 240
const HEIGHT = 140
const PIXEL_RATIO = 2
const CARD_WIDTH = 24
const CARD_HEIGHT = 48
const MAX_FFA_CARDS = 16
const COLORS = {
  CT: {
    card: '#182b39',
    border: '#80c6ef',
    stripe: '#539ac3',
    text: '#d4f0ff',
    flash: '159, 223, 255'
  },
  T: {
    card: '#232923',
    border: '#d8ab65',
    stripe: '#bc904f',
    text: '#ffe3a7',
    flash: '255, 237, 162'
  }
} as const

type CardColors = (typeof COLORS)[keyof typeof COLORS]
type CardIcon = 'skull' | 'grenade' | 'ace'
type CardIconImages = Record<CardIcon, HTMLImageElement>

function loadCardIcons(colors: CardColors, onLoad: () => void): CardIconImages {
  const components = { skull: Skull, grenade: Bomb, ace: Spade }
  return Object.fromEntries(
    (Object.keys(components) as CardIcon[]).map((kind) => {
      const svg = renderToStaticMarkup(
        createElement(components[kind], { color: colors.text, size: 24, strokeWidth: 2.5 })
      )
      const icon = new Image()
      icon.onload = onLoad
      icon.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      return [kind, icon]
    })
  ) as CardIconImages
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  index: number,
  count: number,
  progress: number,
  cardNumber: number,
  kind: 'skull' | 'grenade',
  ace: boolean,
  stacked: boolean,
  colors: CardColors,
  icons: CardIconImages,
  aceMotion: number | null,
  opacity = 1
): void {
  const slot = index - (count - 1) / 2
  const outerSlot = Math.max(1, (count - 1) / 2)
  const radius = Math.abs(slot) / outerSlot
  const eased = 1 - (1 - progress) ** 3
  const spacing = stacked ? Math.max(9, Math.min(12, 130 / (count - 1))) : 11
  const x = 120 + slot * spacing * eased
  const fanRise = Math.min(10, Math.max(1, (count - 3) * 4 + 2))
  const y = 20 + radius ** 1.4 * fanRise + (1 - eased) * 17
  const angle = (slot / outerSlot) * (stacked ? 0.55 : 0.33) * eased
  const flash = 1 - progress
  const flourish = aceMotion === null ? 0 : Math.sin(Math.PI * Math.min(1, aceMotion / 0.65))

  ctx.save()
  ctx.translate(x, y - flourish * 7)
  ctx.rotate(
    angle + (aceMotion === null ? 0 : Math.sin(aceMotion * Math.PI * 8) * (1 - aceMotion) * 0.09)
  )
  ctx.globalAlpha = opacity
  const scale = (0.65 + eased * 0.35) * (1 + flourish * 0.16)
  ctx.scale(scale, scale)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)'
  ctx.fillRect(-CARD_WIDTH / 2 + 3, -CARD_HEIGHT / 2 + 4, CARD_WIDTH, CARD_HEIGHT)
  const face = ctx.createLinearGradient(0, -CARD_HEIGHT / 2, 0, CARD_HEIGHT / 2)
  face.addColorStop(0, colors.stripe)
  face.addColorStop(0.12, colors.card)
  face.addColorStop(1, colors.card)
  ctx.fillStyle = face
  ctx.fillRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT)
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1.4
  ctx.strokeRect(-CARD_WIDTH / 2 + 1, -CARD_HEIGHT / 2 + 1, CARD_WIDTH - 2, CARD_HEIGHT - 2)
  ctx.strokeStyle = colors.stripe
  ctx.lineWidth = 0.5
  ctx.strokeRect(-CARD_WIDTH / 2 + 3, -CARD_HEIGHT / 2 + 3, CARD_WIDTH - 6, CARD_HEIGHT - 6)
  ctx.fillStyle = `rgba(${colors.flash}, ${0.1 + flash * 0.75})`
  ctx.fillRect(-CARD_WIDTH / 2 + 3, -CARD_HEIGHT / 2 + 3, CARD_WIDTH - 6, CARD_HEIGHT - 6)
  const icon = icons[ace ? 'ace' : kind]
  if (ace) {
    if (icon.complete && icon.naturalWidth > 0) ctx.drawImage(icon, -9, -11, 18, 18)
    ctx.fillStyle = colors.text
    ctx.font = 'bold 9px Rajdhani, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('A', -9, -20)
    ctx.font = 'bold 8px Rajdhani, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('ACE', 0, 15)
    if (aceMotion !== null && aceMotion < 1) {
      ctx.fillStyle = `rgba(${colors.flash}, ${(1 - aceMotion) ** 1.5})`
      for (let particle = 0; particle < 8; particle++) {
        const direction = (particle * Math.PI) / 4
        const distance = 13 + aceMotion * 25
        ctx.fillRect(Math.cos(direction) * distance, Math.sin(direction) * distance, 2, 2)
      }
    }
  } else {
    if (icon.complete && icon.naturalWidth > 0) {
      ctx.drawImage(icon, -10, -21, 10, 10)
      ctx.drawImage(icon, 0, 11, 10, 10)
    }
    ctx.fillStyle = colors.text
    ctx.font = `bold ${cardNumber > 9 ? 14 : 20}px Rajdhani, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(cardNumber), 0, 0)
  }
  ctx.restore()
}

function drawKillGlow(
  ctx: CanvasRenderingContext2D,
  index: number,
  count: number,
  progress: number,
  cardProgress: number,
  stacked: boolean,
  colors: CardColors
): void {
  const slot = index - (count - 1) / 2
  const outerSlot = Math.max(1, (count - 1) / 2)
  const radius = Math.abs(slot) / outerSlot
  const eased = 1 - (1 - cardProgress) ** 3
  const spacing = stacked ? Math.max(9, Math.min(12, 130 / (count - 1))) : 11
  const x = 120 + slot * spacing * eased
  const fanRise = Math.min(10, Math.max(1, (count - 3) * 4 + 2))
  const y = 20 + radius ** 1.4 * fanRise + (1 - eased) * 17
  const angle = (slot / outerSlot) * (stacked ? 0.55 : 0.33) * eased
  const baseY = 34
  const beamTop = -CARD_HEIGHT / 2 - 32
  const rise = 1 - (1 - Math.min(1, progress / 0.4)) ** 2
  const fade = progress < 0.4 ? 1 : Math.max(0, 1 - (progress - 0.4) / 0.6) ** 1.3
  if (rise <= 0 || fade <= 0) return
  const tipY = baseY + (beamTop - baseY) * rise
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  const gradient = ctx.createLinearGradient(0, baseY, 0, tipY)
  gradient.addColorStop(0, `rgba(${colors.flash}, ${fade * 0.8})`)
  gradient.addColorStop(1, `rgba(${colors.flash}, ${fade * 0.12})`)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(-14, baseY)
  ctx.lineTo(14, baseY)
  ctx.lineTo(10, tipY)
  ctx.lineTo(-10, tipY)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawMedallion(
  ctx: CanvasRenderingContext2D,
  flash: number,
  colors: CardColors,
  opacity = 1
): void {
  ctx.strokeStyle = colors.border
  ctx.globalAlpha = (0.55 + flash * 0.4) * opacity
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(25, 57)
  ctx.lineTo(98, 57)
  ctx.moveTo(142, 57)
  ctx.lineTo(215, 57)
  ctx.stroke()
  ctx.globalAlpha = opacity

  ctx.fillStyle = '#101712'
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(120, 53, 23, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = colors.stripe
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(120, 53, 20, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = colors.text
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 17px Rajdhani, sans-serif'
  ctx.fillText('1.6', 120, 52)
  ctx.fillStyle = colors.stripe
  ctx.fillRect(110, 64, 20, 2)
}

function drawImpact(
  ctx: CanvasRenderingContext2D,
  progress: number,
  colors: CardColors,
  ace: boolean
): void {
  const fade = (1 - progress) ** 1.5
  const radius = 24 + progress * (ace ? 34 : 20)
  ctx.save()
  ctx.strokeStyle = `rgba(${colors.flash}, ${fade * (ace ? 0.95 : 0.65)})`
  ctx.lineWidth = ace ? 3 : 2
  ctx.beginPath()
  ctx.arc(120, 53, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 1
  for (let index = 0; index < (ace ? 16 : 10); index++) {
    const angle = (index * Math.PI * 2) / (ace ? 16 : 10) + 0.25
    const inner = radius + 4
    const outer = inner + (ace ? 16 : 10) * fade
    ctx.beginPath()
    ctx.moveTo(120 + Math.cos(angle) * inner, 53 + Math.sin(angle) * inner)
    ctx.lineTo(120 + Math.cos(angle) * outer, 53 + Math.sin(angle) * outer)
    ctx.stroke()
  }
  const flare = ctx.createLinearGradient(30, 57, 210, 57)
  flare.addColorStop(0, `rgba(${colors.flash}, 0)`)
  flare.addColorStop(0.5, `rgba(${colors.flash}, ${fade * 0.9})`)
  flare.addColorStop(1, `rgba(${colors.flash}, 0)`)
  ctx.fillStyle = flare
  ctx.fillRect(25, 55, 190, ace ? 4 : 2)
  ctx.restore()
}

function drawPulseBars(
  ctx: CanvasRenderingContext2D,
  progress: number,
  colors: CardColors,
  cardCount: number,
  ace: boolean
): void {
  const envelope = Math.sin(Math.PI * Math.min(1, progress)) ** 0.7
  if (envelope <= 0) return
  ctx.save()
  for (let index = 0; index < 54; index++) {
    const x = 27 + index * 3.5
    const distance = Math.abs(x - 120) / 94
    const shape = Math.max(0, 1 - distance ** 1.5)
    const rhythm = 0.55 + 0.45 * Math.sin(index * 0.86 - progress * 24) ** 2
    const peakHeight = ace ? 58 : 10 + Math.min(cardCount, 5) * 8
    const height = peakHeight * shape * rhythm * envelope
    if (height < 1) continue
    const gradient = ctx.createLinearGradient(x, 57, x, 57 - height)
    gradient.addColorStop(0, `rgba(${colors.flash}, ${envelope * 0.8})`)
    gradient.addColorStop(1, `rgba(${colors.flash}, 0)`)
    ctx.fillStyle = gradient
    ctx.fillRect(x, 57 - height, 1.5, height)
  }
  ctx.restore()
}

export function KillCardsCanvas({
  count,
  mode,
  aceAt,
  side,
  kinds = [],
  lightweight = false,
  className
}: KillCardsCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displayedCount = useRef(0)
  const displayedAceAt = useRef<number | null>(null)
  const animation = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(PIXEL_RATIO, 0, 0, PIXEL_RATIO, 0, 0)
    const colors = side === 'CT' ? COLORS.CT : COLORS.T
    const target = Math.max(0, Math.min(mode === 'F' ? MAX_FFA_CARDS : 5, Math.trunc(count)))
    const initial = lightweight ? target : displayedCount.current
    const aceTriggered =
      !lightweight &&
      mode === 'C' &&
      aceAt !== null &&
      target >= aceAt &&
      displayedAceAt.current !== aceAt
    displayedAceAt.current = aceAt
    const start = performance.now()
    const perCardMs = 280
    const glowMs = 900
    const aceMs = 1100
    const aceDelay = aceTriggered && target > initial ? (target - initial - 1) * perCardMs : 0
    const exitMs = 240
    const render = (): void => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT)
      if (target === 0 && initial === 0) return
      ctx.save()
      ctx.translate(0, 56)
      const elapsed = performance.now() - start
      const adding = target > initial
      const removing = target < initial
      if (removing && target === 0 && elapsed >= exitMs) {
        ctx.restore()
        displayedCount.current = 0
        return
      }
      const complete = elapsed >= (target - initial) * perCardMs
      const stage = adding ? Math.min(target - initial - 1, Math.floor(elapsed / perCardMs)) : 0
      const current = adding
        ? Math.min(target, initial + stage + 1)
        : removing && elapsed < exitMs
          ? initial
          : target
      const visible = Math.min(mode === 'F' ? MAX_FFA_CARDS : 5, current)
      const stacked = mode === 'F' && visible > 5
      const progress = adding && !complete ? (elapsed % perCardMs) / perCardMs : 1
      const exitProgress = Math.min(1, elapsed / exitMs)
      const glowProgress = adding ? (elapsed - stage * perCardMs) / glowMs : 1
      const glowing = adding && glowProgress < 1
      const aceElapsed = elapsed - aceDelay
      const acePlaying = aceTriggered && aceElapsed >= 0 && aceElapsed < aceMs
      const aceProgress = Math.max(0, Math.min(1, aceElapsed / aceMs))
      if (acePlaying) drawKillGlow(ctx, visible - 1, visible, aceProgress, 1, stacked, colors)
      else if (glowing)
        drawKillGlow(ctx, visible - 1, visible, glowProgress, progress, stacked, colors)
      if (acePlaying) {
        drawPulseBars(ctx, aceProgress, colors, visible, true)
        drawImpact(ctx, aceProgress, colors, true)
      } else if (glowing) {
        drawPulseBars(ctx, glowProgress, colors, visible, false)
        drawImpact(ctx, glowProgress, colors, false)
      }
      for (let index = 0; index < visible; index++) {
        const isLast = index === visible - 1
        const cardNumber = mode === 'F' ? current - visible + index + 1 : index + 1
        const ace = mode === 'C' && aceAt === cardNumber && current >= aceAt
        const rejected = removing && cardNumber > target
        if (rejected) {
          ctx.save()
          ctx.translate(0, -8 * exitProgress)
        }
        drawCard(
          ctx,
          index,
          visible,
          adding && isLast ? progress : 1,
          cardNumber,
          kinds[cardNumber - 1] ?? 'skull',
          ace,
          stacked,
          colors,
          icons,
          ace && acePlaying ? aceProgress : null,
          rejected ? 1 - exitProgress : 1
        )
        if (rejected) ctx.restore()
      }
      drawMedallion(
        ctx,
        glowing ? 1 - glowProgress : 0,
        colors,
        removing && target === 0 ? 1 - exitProgress : 1
      )
      ctx.restore()
      if ((adding && (!complete || glowing)) || (removing && exitProgress < 1) || acePlaying) {
        displayedCount.current = current
        animation.current = requestAnimationFrame(render)
      } else {
        displayedCount.current = target
      }
    }
    const icons = loadCardIcons(colors, () => {
      if (animation.current !== null) cancelAnimationFrame(animation.current)
      animation.current = requestAnimationFrame(render)
    })
    animation.current = requestAnimationFrame(render)
    return () => {
      for (const icon of Object.values(icons)) icon.onload = null
      if (animation.current !== null) cancelAnimationFrame(animation.current)
    }
  }, [count, mode, aceAt, side, kinds, lightweight])

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH * PIXEL_RATIO}
      height={HEIGHT * PIXEL_RATIO}
      className={twMerge('h-[140px] w-[240px]', className)}
      aria-label={`${Math.max(0, Math.min(mode === 'F' ? MAX_FFA_CARDS : 5, count))} kill streak${mode === 'C' && aceAt !== null ? `, ace on card ${aceAt}` : ''}`}
      role="img"
    />
  )
}
