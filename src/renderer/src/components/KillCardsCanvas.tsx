import { useEffect, useRef, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'

interface KillCardsCanvasProps {
  count: number
  mode: 'C' | 'F'
  aceAt: number | null
  side: 'CT' | 'T' | 'F'
  className?: string
}

const WIDTH = 240
const HEIGHT = 140
const PIXEL_RATIO = 2
const CARD_WIDTH = 29
const CARD_HEIGHT = 42
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

function drawAceIcon(ctx: CanvasRenderingContext2D, colors: CardColors): void {
  ctx.fillStyle = colors.text
  ctx.font = 'bold 11px Rajdhani, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('A', -10, -11)
  ctx.beginPath()
  ctx.moveTo(0, -12)
  ctx.bezierCurveTo(-2, -7, -9, -4, -9, 1)
  ctx.bezierCurveTo(-9, 7, -2, 8, 0, 3)
  ctx.bezierCurveTo(2, 8, 9, 7, 9, 1)
  ctx.bezierCurveTo(9, -4, 2, -7, 0, -12)
  ctx.fill()
  ctx.fillRect(-2, 2, 4, 9)
  ctx.fillRect(-5, 10, 10, 2)
  ctx.font = 'bold 9px Rajdhani, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('ACE', 0, 17)
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  index: number,
  count: number,
  progress: number,
  label: string,
  ace: boolean,
  stacked: boolean,
  last: boolean,
  colors: CardColors,
  opacity = 1
): void {
  const slot = index - (count - 1) / 2
  const outerSlot = Math.max(1, (count - 1) / 2)
  const radius = Math.abs(slot) / outerSlot
  const eased = 1 - (1 - progress) ** 3
  const spacing = stacked ? Math.max(12, Math.min(18, 180 / (count - 1))) : 24
  const x = 120 + slot * spacing * eased
  const y = 21 + radius ** 1.4 * 17 + (1 - eased) * 6
  const angle = (slot / outerSlot) * (stacked ? 0.7 : 0.55) * eased
  const flash = 1 - progress

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.globalAlpha = (0.4 + eased * 0.6) * opacity
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)'
  ctx.fillRect(-CARD_WIDTH / 2 + 3, -CARD_HEIGHT / 2 + 4, CARD_WIDTH, CARD_HEIGHT)
  ctx.fillStyle = colors.card
  ctx.fillRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT)
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 2
  ctx.strokeRect(-CARD_WIDTH / 2 + 1, -CARD_HEIGHT / 2 + 1, CARD_WIDTH - 2, CARD_HEIGHT - 2)
  ctx.fillStyle = colors.stripe
  ctx.fillRect(-CARD_WIDTH / 2 + 5, -CARD_HEIGHT / 2 + 5, CARD_WIDTH - 10, 2)
  ctx.fillStyle = `rgba(${colors.flash}, ${0.1 + flash * 0.75})`
  ctx.fillRect(-CARD_WIDTH / 2 + 3, -CARD_HEIGHT / 2 + 3, CARD_WIDTH - 6, CARD_HEIGHT - 6)
  if (ace) {
    drawAceIcon(ctx, colors)
  } else {
    ctx.fillStyle = colors.text
    ctx.font = `bold ${stacked && !last ? 9 : label.length > 2 ? 13 : 20}px Rajdhani, sans-serif`
    ctx.textAlign = stacked && !last ? 'left' : 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, stacked && !last ? -11 : 0, -3)
  }
  ctx.restore()
}

function drawKillGlow(
  ctx: CanvasRenderingContext2D,
  index: number,
  count: number,
  progress: number,
  stacked: boolean,
  colors: CardColors
): void {
  const slot = index - (count - 1) / 2
  const outerSlot = Math.max(1, (count - 1) / 2)
  const radius = Math.abs(slot) / outerSlot
  const eased = Math.min(1, 0.5 + progress * 2)
  const spacing = stacked ? Math.max(12, Math.min(18, 180 / (count - 1))) : 24
  const x = 120 + slot * spacing * eased
  const y = 21 + radius ** 1.4 * 17 + (1 - eased) * 6
  const angle = (slot / outerSlot) * (stacked ? 0.7 : 0.55) * eased
  const top = -CARD_HEIGHT / 2
  const beamHeight = Math.min(72, 24 + index * 8)
  const beamTop = top - beamHeight * eased
  const intensity = Math.min(1, 1.1 * (1 - progress) ** 0.65)
  if (intensity <= 0) return
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  const gradient = ctx.createLinearGradient(0, beamTop, 0, top + 16)
  gradient.addColorStop(0, `rgba(${colors.flash}, 0)`)
  gradient.addColorStop(0.65, `rgba(${colors.flash}, ${intensity * 0.45})`)
  gradient.addColorStop(1, `rgba(${colors.flash}, ${intensity})`)
  ctx.fillStyle = gradient
  ctx.fillRect(-CARD_WIDTH / 2, beamTop, CARD_WIDTH, top + 16 - beamTop)
  ctx.restore()
}

function drawMedallion(
  ctx: CanvasRenderingContext2D,
  flash: number,
  logo: HTMLImageElement,
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
  if (logo.complete && logo.naturalWidth > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(120, 53, 19, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(logo, 102, 35, 36, 36)
    ctx.restore()
  }
}

export function KillCardsCanvas({
  count,
  mode,
  aceAt,
  side,
  className
}: KillCardsCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displayedCount = useRef(0)
  const animation = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(PIXEL_RATIO, 0, 0, PIXEL_RATIO, 0, 0)
    const logo = new Image()
    const colors = side === 'CT' ? COLORS.CT : COLORS.T
    const target = Math.max(0, Math.min(mode === 'F' ? MAX_FFA_CARDS : 5, Math.trunc(count)))
    const initial = displayedCount.current
    const start = performance.now()
    const perCardMs = 280
    const glowMs = 800
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
      if (glowing) drawKillGlow(ctx, visible - 1, visible, glowProgress, stacked, colors)
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
          String(cardNumber),
          ace,
          stacked,
          isLast,
          colors,
          rejected ? 1 - exitProgress : 1
        )
        if (rejected) ctx.restore()
      }
      drawMedallion(
        ctx,
        glowing ? 1 - glowProgress : 0,
        logo,
        colors,
        removing && target === 0 ? 1 - exitProgress : 1
      )
      ctx.restore()
      if ((adding && (!complete || glowing)) || (removing && exitProgress < 1)) {
        displayedCount.current = current
        animation.current = requestAnimationFrame(render)
      } else {
        displayedCount.current = target
      }
    }
    logo.onload = render
    logo.src = './favicon.svg'
    animation.current = requestAnimationFrame(render)
    return () => {
      logo.onload = null
      if (animation.current !== null) cancelAnimationFrame(animation.current)
    }
  }, [count, mode, aceAt, side])

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
