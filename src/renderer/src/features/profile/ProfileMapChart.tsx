import { useEffect, useId, useRef, type JSX } from 'react'
import {
  Chart,
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js'
import { twMerge } from 'tailwind-merge'
import { profileMapAxes, type ProfileActivityEntry } from '../../../../shared/profile-activity'
import { useTranslation } from '../i18n/i18n'

Chart.register(
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
)

export function ProfileMapChart({
  entries,
  compact = false,
  className
}: {
  entries: ProfileActivityEntry[]
  compact?: boolean
  className?: string
}): JSX.Element {
  const { t, language } = useTranslation()
  const titleId = useId()
  const canvas = useRef<HTMLCanvasElement>(null)
  const axes = profileMapAxes(entries)
  const description = axes
    .map(
      (entry) =>
        `${entry.others ? t('profile.others') : entry.id}: ${t('profile.matchCount', { count: entry.matches })}; ${t('profile.wins')}: ${entry.wins}`
    )
    .join('; ')
  useEffect(() => {
    if (!canvas.current) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const data = profileMapAxes(entries)
    const axisCount = Math.max(3, data.length)
    const total = data.reduce((sum, entry) => sum + entry.matches, 0)
    const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 })
    const chart = new Chart(canvas.current, {
      type: 'radar',
      data: {
        labels: Array.from({ length: axisCount }, (_, axis) => {
          const entry = data[axis]
          return entry ? (entry.others ? t('profile.others') : entry.id) : '—'
        }),
        datasets: [
          {
            label: t('profile.matches'),
            data: Array.from({ length: axisCount }, (_, axis) => data[axis]?.matches ?? 0),
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56,189,248,0.18)',
            borderWidth: 2,
            pointBackgroundColor: '#7dd3fc',
            pointBorderWidth: 0,
            pointRadius: data.map(() => 3),
            pointHoverRadius: 5,
            fill: true
          },
          {
            label: t('profile.wins'),
            data: Array.from({ length: axisCount }, (_, axis) => data[axis]?.wins ?? 0),
            borderColor: '#34d399',
            backgroundColor: 'rgba(52,211,153,0.14)',
            borderWidth: 2,
            borderDash: [5, 3],
            pointBackgroundColor: '#6ee7b7',
            pointStyle: 'rectRot',
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion.matches ? false : { duration: 650, easing: 'easeOutQuart' },
        transitions: { active: { animation: { duration: reducedMotion.matches ? 0 : 150 } } },
        layout: { padding: 0 },
        scales: {
          r: {
            beginAtZero: true,
            min: 0,
            suggestedMax: Math.max(1, ...data.map((entry) => entry.matches)),
            grid: { color: 'rgba(255,255,255,0.15)', circular: false },
            angleLines: { color: 'rgba(255,255,255,0.15)' },
            pointLabels: {
              color: '#e5e5e5',
              font: { family: 'Rajdhani, sans-serif', size: 13 },
              padding: 4
            },
            ticks: { precision: 0, color: '#a3a3a3', backdropColor: '#0a0a0a', maxTicksLimit: 5 }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#e5e5e5',
              usePointStyle: true,
              padding: 12,
              font: { family: 'Rajdhani, sans-serif', size: 14 }
            }
          },
          tooltip: {
            cornerRadius: 0,
            filter: (item) => Boolean(data[item.dataIndex]),
            callbacks: {
              title: (items) => {
                const entry = data[items[0]?.dataIndex]
                return entry ? (entry.others ? t('profile.others') : entry.id) : ''
              },
              label: (item) => {
                const entry = data[item.dataIndex]
                if (!entry) return ''
                return [
                  `${item.dataset.label}: ${item.formattedValue}`,
                  t('profile.share', { percent: percent.format(entry.matches / total) }),
                  t('profile.winPercent', { percent: percent.format(entry.wins / entry.matches) })
                ]
              }
            }
          }
        }
      }
    })
    const updateMotion = (): void => {
      chart.options.animation = reducedMotion.matches
        ? false
        : { duration: 650, easing: 'easeOutQuart' }
      chart.options.transitions = {
        active: { animation: { duration: reducedMotion.matches ? 0 : 150 } }
      }
      chart.stop()
      chart.update('none')
    }
    reducedMotion.addEventListener('change', updateMotion)
    return () => {
      reducedMotion.removeEventListener('change', updateMotion)
      chart.destroy()
    }
  }, [entries, language, t])
  return (
    <figure aria-labelledby={titleId} className={twMerge('min-w-0', className)}>
      <figcaption id={titleId} className="mb-4 text-xl font-semibold">
        {t('profile.mostMaps')}
      </figcaption>
      <div
        className={`relative ${compact ? 'h-[28rem]' : 'h-[32rem]'} min-w-0 border-t border-white/15`}
      >
        <canvas ref={canvas} role="img" aria-label={description}>
          {description}
        </canvas>
      </div>
    </figure>
  )
}
