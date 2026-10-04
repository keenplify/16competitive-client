import { useId, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'

const PALETTES = [
  { light: '#f3dba7', metal: '#b9894d', dark: '#573923', enamel: '#263e48' },
  { light: '#f4dfad', metal: '#c69b5a', dark: '#654323', enamel: '#315449' },
  { light: '#fff0c1', metal: '#d1a969', dark: '#735021', enamel: '#324b70' },
  { light: '#fff0ca', metal: '#dab16c', dark: '#784a25', enamel: '#413d72' },
  { light: '#fff1c9', metal: '#dfb86c', dark: '#7c4d21', enamel: '#284d75' },
  { light: '#fff1ce', metal: '#e4bd70', dark: '#804820', enamel: '#63394a' },
  { light: '#fff4d2', metal: '#e9c579', dark: '#865322', enamel: '#284c67' },
  { light: '#fff7dc', metal: '#efd18b', dark: '#8f5425', enamel: '#553b6d' }
] as const

interface ProfileRankInsigniaProps {
  level: number
  title: string
  className?: string
}

function Star({
  x = 32,
  y = 32,
  size = 8
}: {
  x?: number
  y?: number
  size?: number
}): JSX.Element {
  return (
    <path
      d="M0 -1 0.24 -0.3 0.95 -0.3 0.38 0.12 0.59 0.82 0 0.41 -0.59 0.82 -0.38 0.12 -0.95 -0.3 -0.24 -0.3Z"
      transform={`translate(${x} ${y}) scale(${size})`}
      fill="currentColor"
    />
  )
}

export function ProfileRankInsignia({
  level,
  title,
  className
}: ProfileRankInsigniaProps): JSX.Element {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.min(40, Math.floor(level))) : 1
  const tier = Math.floor((safeLevel - 1) / 5)
  const grade = ((safeLevel - 1) % 5) + 1
  const colors = PALETTES[tier]
  const rawId = useId().replace(/:/g, '')
  const metalId = `rank-metal-${rawId}`
  const enamelId = `rank-enamel-${rawId}`
  const glintId = `rank-glint-${rawId}`
  const gradeMarks = Array.from({ length: grade }, (_, index) => index)

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Level ${safeLevel}, ${title}`}
      className={twMerge('block size-10 shrink-0 drop-shadow-[0_2px_3px_rgba(0,0,0,0.85)]', className)}
    >
      <defs>
        <linearGradient id={metalId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors.dark} />
          <stop offset="0.23" stopColor={colors.light} />
          <stop offset="0.52" stopColor={colors.metal} />
          <stop offset="0.78" stopColor={colors.light} />
          <stop offset="1" stopColor={colors.dark} />
        </linearGradient>
        <linearGradient id={enamelId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.enamel} />
          <stop offset="1" stopColor="#101b28" />
        </linearGradient>
        <radialGradient id={glintId}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="1" stopColor={colors.light} stopOpacity="0" />
        </radialGradient>
      </defs>

      {tier === 0 && (
        <g
          fill={`url(#${metalId})`}
          stroke={colors.dark}
          strokeWidth="1.2"
          strokeLinejoin="round"
          transform={`translate(0 ${-13.5 + (grade - 1) * 4.5})`}
        >
          {gradeMarks.map((mark) => (
            <path
              key={mark}
              d={`M13 ${48 - mark * 9} 32 ${36 - mark * 9} 51 ${48 - mark * 9} 51 ${55 - mark * 9} 32 ${43 - mark * 9} 13 ${55 - mark * 9}Z`}
            />
          ))}
        </g>
      )}

      {tier === 1 && (
        <g strokeLinejoin="round">
          <path
            d="M8 29 32 8 56 29 32 55Z"
            fill={`url(#${metalId})`}
            stroke={colors.dark}
            strokeWidth="2"
          />
          <path
            d="M15 30 32 15 49 30 32 47Z"
            fill={`url(#${enamelId})`}
            stroke={colors.light}
            strokeWidth="1.5"
          />
          <path
            d="M19 31 32 21 45 31 32 41Z"
            fill={`url(#${metalId})`}
            stroke={colors.dark}
            strokeWidth="1"
          />
          {gradeMarks.map((mark) => (
            <path key={mark} d={`M${22 + mark * 5} 27v9`} stroke={colors.light} strokeWidth="2.4" />
          ))}
        </g>
      )}

      {tier === 2 && (
        <g strokeLinejoin="round">
          <path
            d="M12 14h40l5 11-5 25H12L7 25Z"
            fill={`url(#${metalId})`}
            stroke={colors.dark}
            strokeWidth="2"
          />
          <path
            d="M14 20h36l2 6-3 17H15l-3-17Z"
            fill={`url(#${enamelId})`}
            stroke={colors.light}
            strokeWidth="1.2"
          />
          {gradeMarks.map((mark) => (
            <path
              key={mark}
              d={`M${18 + mark * 7} 23v19`}
              stroke={colors.light}
              strokeWidth="3.5"
            />
          ))}
          <path d="M9 49h46v4H9Z" fill={`url(#${metalId})`} stroke={colors.dark} />
        </g>
      )}

      {tier === 3 && (
        <g strokeLinejoin="round">
          <path
            d="M32 5 53 16 50 43 32 58 14 43 11 16Z"
            fill={`url(#${metalId})`}
            stroke={colors.dark}
            strokeWidth="2"
          />
          <path
            d="M32 12 47 20 44 40 32 51 20 40 17 20Z"
            fill={`url(#${enamelId})`}
            stroke={colors.light}
            strokeWidth="1.2"
          />
          <path
            d="M32 18 36 28 47 29 39 35 42 46 32 39 22 46 25 35 17 29 28 28Z"
            fill={`url(#${metalId})`}
            stroke={colors.dark}
            strokeWidth="1.2"
          />
          {gradeMarks.map((mark) => (
            <circle key={mark} cx={20 + mark * 6} cy="13" r="1.5" fill={colors.light} />
          ))}
        </g>
      )}

      {tier === 4 && (
        <g strokeLinejoin="round">
          <circle
            cx="32"
            cy="31"
            r="26"
            fill={`url(#${metalId})`}
            stroke={colors.dark}
            strokeWidth="2"
          />
          <circle
            cx="32"
            cy="31"
            r="20"
            fill={`url(#${enamelId})`}
            stroke={colors.light}
            strokeWidth="1.5"
          />
          <circle cx="32" cy="31" r="15" fill="none" stroke={colors.metal} strokeWidth="1" />
          <g color={colors.light}>
            <Star x={32} y={31} size={10} />
          </g>
          {gradeMarks.map((mark) => (
            <circle
              key={mark}
              cx={20 + mark * 6}
              cy="55"
              r="2.2"
              fill={`url(#${metalId})`}
              stroke={colors.dark}
              strokeWidth="0.7"
            />
          ))}
        </g>
      )}

      {tier === 5 && (
        <g strokeLinejoin="round">
          <path
            d="M4 24 21 17 32 5 43 17 60 24 53 47 32 59 11 47Z"
            fill={`url(#${metalId})`}
            stroke={colors.dark}
            strokeWidth="2"
          />
          <path
            d="M12 27 24 22 32 13 40 22 52 27 48 42 32 52 16 42Z"
            fill={`url(#${enamelId})`}
            stroke={colors.light}
            strokeWidth="1.4"
          />
          <path
            d="M32 18v26M25 27l7-9 7 9M23 37h18"
            fill="none"
            stroke={`url(#${metalId})`}
            strokeWidth="4"
            strokeLinecap="round"
          />
          {gradeMarks.map((mark) => (
            <circle key={mark} cx={20 + mark * 6} cy="47" r="1.7" fill={colors.light} />
          ))}
        </g>
      )}

      {tier === 6 && (
        <g strokeLinejoin="round">
          <path
            d="M32 15 9 9 3 15 13 25 5 25 15 34 11 36 27 43 32 54 37 43 53 36 49 34 59 25 51 25 61 15 55 9Z"
            fill={`url(#${metalId})`}
            stroke={colors.dark}
            strokeWidth="1.7"
          />
          <path
            d="M32 18 13 15 25 27 10 27 28 37 32 49 36 37 54 27 39 27 51 15Z"
            fill={`url(#${enamelId})`}
            stroke={colors.light}
            strokeWidth="1"
          />
          <path
            d="M32 15 40 29 32 42 24 29Z"
            fill={`url(#${metalId})`}
            stroke={colors.dark}
            strokeWidth="1.2"
          />
          {gradeMarks.map((mark) => (
            <circle
              key={mark}
              cx={20 + mark * 6}
              cy="8"
              r="2"
              fill={colors.light}
              stroke={colors.dark}
              strokeWidth="0.6"
            />
          ))}
        </g>
      )}

      {tier === 7 && (
        <g strokeLinejoin="round">
          <path
            d="M32 3 40 14 55 11 51 25 62 32 51 39 55 53 40 50 32 61 24 50 9 53 13 39 2 32 13 25 9 11 24 14Z"
            fill={`url(#${metalId})`}
            stroke={colors.dark}
            strokeWidth="2"
          />
          <circle
            cx="32"
            cy="32"
            r="20"
            fill={`url(#${enamelId})`}
            stroke={colors.light}
            strokeWidth="2"
          />
          <circle cx="32" cy="32" r="15" fill="none" stroke={colors.metal} strokeWidth="1.5" />
          <g color={colors.light}>
            <Star x={32} y={32} size={11} />
          </g>
          {gradeMarks.map((mark) => (
            <circle key={mark} cx={20 + mark * 6} cy="56" r="1.8" fill={colors.light} />
          ))}
        </g>
      )}
      {tier >= 4 && <circle cx="23" cy="19" r="9" fill={`url(#${glintId})`} opacity="0.55" />}
    </svg>
  )
}
