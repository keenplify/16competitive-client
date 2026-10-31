import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import {
  getCs2Crosshair,
  upgradeCrosshairToCs2,
  type CrosshairProfile
} from '../../../shared/crosshair'

type Props = { profile: CrosshairProfile; shotSpread?: number; label: string; className?: string }

/** Uses the player's saved crosshair profile; the surrounding preview owns shot feedback. */
export function CrosshairPreview({
  profile,
  shotSpread = 0,
  label,
  className
}: Props): JSX.Element {
  const c = getCs2Crosshair(upgradeCrosshairToCs2(profile))!
  const dynamic = [0, 1, 2, 7].includes(c.style) || c.style === 5
  const gap = Math.max(0, c.gap + 2) + (dynamic ? shotSpread : 0)
  const length = c.length
  const thickness = Math.max(1, c.thickness)
  const color = `rgb(${c.red},${c.green},${c.blue})`
  const stroke = `rgba(${c.outlineRed},${c.outlineGreen},${c.outlineBlue},${(c.outlineAlpha / 255) * (c.outlineMode === 2 ? 0.5 : 1)})`
  const arm = (x: number, y: number, width: number, height: number, key: string): JSX.Element => (
    <rect
      key={key}
      x={x}
      y={y}
      width={width}
      height={height}
      fill={color}
      stroke={c.outlineMode ? stroke : 'none'}
      strokeWidth={c.outlineMode ? 1 : 0}
      paintOrder="stroke"
    />
  )
  const radius = gap + length
  const ring = c.style === 1 || c.style === 3
  const quadrant = c.style === 7 || c.style === 9
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="-320 -320 640 640"
      className={twMerge(
        'pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2',
        className
      )}
      style={{ opacity: c.alpha / 255 }}
    >
      {ring ? (
        <circle r={radius} fill="none" stroke={color} strokeWidth={thickness} />
      ) : c.style === 8 ? (
        <rect
          x={-radius}
          y={-radius}
          width={radius * 2}
          height={radius * 2}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
        />
      ) : quadrant ? (
        [-1, 1].flatMap((x) =>
          [-1, 1].map((y) => (
            <path
              key={`${x}:${y}`}
              d={`M ${x * gap} ${y * radius} H ${x * radius} V ${y * gap}`}
              fill="none"
              stroke={color}
              strokeWidth={thickness}
            />
          ))
        )
      ) : c.style !== 6 ? (
        <>
          {arm(gap, -thickness / 2, length, thickness, 'right')}
          {arm(-gap - length, -thickness / 2, length, thickness, 'left')}
          {arm(-thickness / 2, gap, thickness, length, 'bottom')}
          {!c.tStyleEnabled && arm(-thickness / 2, -gap - length, thickness, length, 'top')}
        </>
      ) : null}
      {(c.style === 6 || c.centerDotEnabled) &&
        arm(-thickness / 2, -thickness / 2, thickness, thickness, 'dot')}
    </svg>
  )
}
