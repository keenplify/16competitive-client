import type { JSX } from 'react'

interface VolumeControlProps {
  label: string
  description: string
  value: number
  onChange: (value: number) => void
}

export function VolumeControl({
  label,
  description,
  value,
  onChange
}: VolumeControlProps): JSX.Element {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-neutral-200">{label}</span>
        <span className="font-mono text-sm tabular-nums text-sky-300">{value}%</span>
      </span>
      <span className="mt-1 block text-xs text-neutral-500">{description}</span>
      <input
        className="mt-3 w-full cursor-pointer accent-sky-400"
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        aria-label={`${label} volume`}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  )
}
