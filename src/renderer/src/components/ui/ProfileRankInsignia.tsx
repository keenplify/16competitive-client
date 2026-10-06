import { useId, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'

interface ProfileRankInsigniaProps {
  level: number
  title: string
  className?: string
}

// Original rank artwork: broken stripes, slanted bars, crystal leaves, winged
// crests and four-point compass stars. Inline paths also work in canvas nameplates.
const STRIPE = 'M9 13 28 3V10L9 20ZM36 3 55 13V20L36 10Z'
const COMPASS = 'M0 -10 3 -3 10 0 3 3 0 10 -3 3 -10 0 -3 -3Z'
const LEAF =
  'M32 5 38 17 35 25 48 16 48 28 38 34 49 33 43 44 35 43 35 50H29V43L21 44 15 33 26 34 16 28V16L29 25 26 17Z'
const STAR_POSITIONS = [[], [32], [21, 43], [15, 32, 49], [11, 25, 39, 53], [9, 20.5, 32, 43.5, 55]]

function Stripes({ count, fill }: { count: number; fill: string }): JSX.Element {
  return (
    <g fill={fill} stroke="#544126" strokeWidth="0.6">
      {Array.from({ length: count }, (_, index) => (
        <path
          key={index}
          d={STRIPE}
          transform={`translate(0 ${10 + index * 12 - (count - 1) * 5})`}
        />
      ))}
    </g>
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
  const id = useId().replace(/:/g, '')
  const gold = `url(#rank-gold-${id})`
  const silver = `url(#rank-silver-${id})`

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Level ${safeLevel}, ${title}`}
      className={twMerge(
        'block size-10 shrink-0 drop-shadow-[0_2px_3px_rgba(0,0,0,0.85)]',
        className
      )}
    >
      <defs>
        <linearGradient id={`rank-gold-${id}`} x1="0" y1="0" x2="0.7" y2="1">
          <stop stopColor="#fff0b4" />
          <stop offset="0.45" stopColor="#ddb458" />
          <stop offset="1" stopColor="#8c612a" />
        </linearGradient>
        <linearGradient id={`rank-silver-${id}`} x1="0" y1="0" x2="0.7" y2="1">
          <stop stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#c9d7dc" />
          <stop offset="1" stopColor="#647d89" />
        </linearGradient>
      </defs>

      {tier === 0 && (
        <g>
          {grade !== 4 && <Stripes count={grade === 5 ? 2 : 1} fill={gold} />}
          {grade === 3 && <path d="M17 35 28 41V47L17 41ZM47 35 36 41V47L47 41Z" fill={gold} />}
          {grade === 4 && (
            <g fill={gold} stroke="#604827" strokeWidth="0.8">
              <path
                d="M22 7H42L54 19V37L42 49H22L10 37V19ZM24 14 17 21V35L24 42H40L47 35V21L40 14Z"
                fillRule="evenodd"
              />
              <path d="M32 17 40 28 32 39 24 28Z" />
            </g>
          )}
        </g>
      )}

      {tier === 1 && (
        <g>
          <Stripes count={3} fill={gold} />
          {grade >= 3 && <path d="M9 43H25V48H9ZM39 43H55V48H39Z" fill={silver} />}
          {grade === 5 && <path d="M32 38 36 43 32 48 28 43Z" fill={gold} />}
        </g>
      )}

      {tier === 2 && (
        <g>
          <Stripes count={3} fill={gold} />
          <path
            d="M5 24V43L15 50H25M59 24V43L49 50H39"
            fill="none"
            stroke={silver}
            strokeWidth="2.5"
          />
          <path
            d={COMPASS}
            transform={`translate(32 43) scale(${grade >= 3 ? 0.65 : 0.4})`}
            fill={gold}
          />
          {grade >= 4 && (
            <path
              d="M19 41 16 45 20 48M45 41 48 45 44 48"
              fill="none"
              stroke={gold}
              strokeWidth="2"
            />
          )}
        </g>
      )}

      {tier === 3 && (
        <g>
          <path d="M16 12 26 6V47L16 52ZM38 6 48 12V52L38 47Z" fill={silver} stroke="#52656b" />
          {Array.from({ length: grade }, (_, index) => (
            <path key={index} d={`M27 ${12 + index * 8}h10v4H27Z`} fill={gold} />
          ))}
        </g>
      )}

      {tier === 4 &&
        (grade <= 3 ? (
          <g fill={grade === 1 ? gold : silver} stroke="#52656b" strokeWidth="0.8">
            <path
              d="M22 13 32 6 42 13V43L32 50 22 43ZM29 19V37L32 40 35 37V19L32 16Z"
              fillRule="evenodd"
            />
            {grade === 3 && <path d="M11 15 17 11V45L11 49ZM47 11 53 15V49L47 45Z" />}
          </g>
        ) : (
          <g>
            <path d={LEAF} fill={grade === 4 ? gold : silver} stroke="#536064" strokeWidth="0.8" />
            <path
              d="M32 12V47M32 34 21 23M32 34 43 23M32 39 23 38M32 39 41 38"
              fill="none"
              stroke="#182730"
              strokeWidth="1.3"
              strokeOpacity="0.65"
            />
          </g>
        ))}

      {tier === 5 && (
        <g fill={silver} stroke="#536773" strokeWidth="0.7">
          <path d="M3 12 24 19 24 27 8 22ZM8 26 23 31 23 37 13 33ZM14 37 25 41 27 47 19 44Z" />
          <path d="M61 12 40 19 40 27 56 22ZM56 26 41 31 41 37 51 33ZM50 37 39 41 37 47 45 44Z" />
          <path d="M32 5 38 15 36 24 40 34 32 49 24 34 28 24 26 15Z" fill={gold} />
          <path d="M32 22 35 33 32 40 29 33Z" fill="#172830" stroke="none" />
        </g>
      )}

      {tier === 6 && (
        <g>
          <path
            d="M7 18V11H18M57 18V11H46M7 38V45H18M57 38V45H46"
            fill="none"
            stroke={gold}
            strokeWidth="2"
          />
          {STAR_POSITIONS[grade].map((x) => (
            <path
              key={x}
              d={COMPASS}
              transform={`translate(${x} 28) scale(${grade <= 2 ? 0.9 : grade === 3 ? 0.72 : 0.52})`}
              fill={silver}
            />
          ))}
        </g>
      )}

      {tier === 7 && (
        <g>
          <path
            d="M22 5 9 14V39L22 49M42 5 55 14V39L42 49"
            fill="none"
            stroke={gold}
            strokeWidth="3"
          />
          <path d="M5 21V34M59 21V34" stroke={silver} strokeWidth="2" />
          {[
            [32, 13],
            [20, 26],
            [44, 26],
            [32, 40]
          ].map(([x, y]) => (
            <path
              key={`${x}-${y}`}
              d={COMPASS}
              transform={`translate(${x} ${y}) scale(0.58)`}
              fill={gold}
            />
          ))}
          <path d="M32 21 37 26 32 31 27 26Z" fill={silver} />
        </g>
      )}

      {Array.from({ length: 5 }, (_, index) => (
        <path
          key={index}
          d={`M${11 + index * 9} 57h7v5h-7Z`}
          fill={index < grade ? gold : '#243139'}
          stroke={index < grade ? '#8c612a' : '#101a20'}
          strokeWidth="0.6"
        />
      ))}
    </svg>
  )
}
