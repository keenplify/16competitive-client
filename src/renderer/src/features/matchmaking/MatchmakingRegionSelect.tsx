import Select from 'react-select'
import { twMerge } from 'tailwind-merge'
import type { JSX } from 'react'
import type { MatchmakingNode } from '../../../../shared/matchmaking'

type MatchmakingNodeWithLatency = MatchmakingNode & { latencyMs?: number | null }

interface RegionOption {
  value: string
  label: string
  node: MatchmakingNodeWithLatency | null
  latencyMs: number | null
  available: boolean
  automatic: boolean
}

const regionLabel = (region: string): string =>
  region === 'sea'
    ? 'SEA'
    : region
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')

interface MatchmakingRegionSelectProps {
  nodes: MatchmakingNode[]
  selectedNodeId: string | null
  disabled: boolean
  onChange: (nodeId: string | null) => void
}

const nodeLatency = (node: MatchmakingNodeWithLatency): number | null =>
  typeof node.latencyMs === 'number' && Number.isFinite(node.latencyMs)
    ? Math.max(0, Math.round(node.latencyMs))
    : null

const latencyDotClass = (latencyMs: number | null, available: boolean): string => {
  if (!available || latencyMs === null) return 'bg-neutral-600'
  if (latencyMs <= 100) return 'bg-emerald-400'
  if (latencyMs <= 200) return 'bg-yellow-400'
  if (latencyMs < 300) return 'bg-orange-400'
  return 'bg-red-500'
}

const latencyLabel = (latencyMs: number | null, available: boolean): string => {
  if (!available) return 'Unavailable'
  return latencyMs === null ? 'No ping' : `${latencyMs} ms`
}

export function MatchmakingRegionSelect({
  nodes,
  selectedNodeId,
  disabled,
  onChange
}: MatchmakingRegionSelectProps): JSX.Element {
  const measuredNodes = nodes as MatchmakingNodeWithLatency[]
  const bestNode = measuredNodes
    .filter((node) => node.available && nodeLatency(node) !== null)
    .sort((left, right) => (nodeLatency(left) ?? Infinity) - (nodeLatency(right) ?? Infinity))[0]

  const automaticOption: RegionOption = {
    value: '',
    label: 'Automatic',
    node: bestNode ?? null,
    latencyMs: bestNode ? nodeLatency(bestNode) : null,
    available: true,
    automatic: true
  }

  const regionOptions: RegionOption[] = [...measuredNodes]
    .sort((left, right) => {
      if (left.available !== right.available) return left.available ? -1 : 1
      return (nodeLatency(left) ?? Infinity) - (nodeLatency(right) ?? Infinity)
    })
    .map((node) => ({
      value: node.id,
      label: `${regionLabel(node.region)} · ${node.id}`,
      node,
      latencyMs: nodeLatency(node),
      available: node.available,
      automatic: false
    }))

  const options = [automaticOption, ...regionOptions]
  const selectedOption =
    options.find((option) => option.value === (selectedNodeId ?? '')) ?? automaticOption

  return (
    <div className="w-full max-w-sm">
      <Select<RegionOption, false>
        inputId="matchmaking-region"
        instanceId="matchmaking-region"
        aria-label="Preferred matchmaking region"
        unstyled
        isClearable={false}
        isSearchable={false}
        isDisabled={disabled}
        options={options}
        value={selectedOption}
        isOptionDisabled={(option) => !option.automatic && !option.available}
        onChange={(option) => onChange(option?.value || null)}
        classNames={{
          container: () => 'mt-3 w-full text-sm',
          control: ({ isFocused, isDisabled }) =>
            twMerge(
              'min-h-11 cursor-pointer rounded-md border border-white/10 bg-neutral-900 text-white transition',
              isFocused && 'border-sky-400/60 ring-1 ring-sky-400/20',
              isDisabled && 'cursor-not-allowed opacity-60'
            ),
          valueContainer: () => 'px-3 py-1',
          singleValue: () => 'w-full',
          indicatorsContainer: () => 'px-2 text-neutral-400',
          dropdownIndicator: ({ isFocused }) =>
            twMerge('transition-colors', isFocused && 'text-sky-300'),
          indicatorSeparator: () => 'hidden',
          menu: () =>
            'z-50 mt-1 overflow-hidden rounded-md border border-white/10 bg-neutral-950 shadow-2xl',
          menuList: () => 'max-h-72 py-1',
          option: ({ isFocused, isSelected, isDisabled }) =>
            twMerge(
              'cursor-pointer px-3 py-2.5 text-neutral-200 transition-colors',
              isFocused && 'bg-white/8',
              isSelected && 'bg-sky-400/12 text-white',
              isDisabled && 'cursor-not-allowed opacity-45'
            ),
          noOptionsMessage: () => 'px-3 py-3 text-neutral-500'
        }}
        formatOptionLabel={(option) => {
          const node = option.node
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={twMerge(
                  'size-2.5 shrink-0 rounded-full shadow-[0_0_8px_currentColor]',
                  latencyDotClass(option.latencyMs, option.available)
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {option.automatic ? 'Automatic' : node ? regionLabel(node.region) : ''}
                </span>
                <span className="block truncate text-[11px] text-neutral-500">
                  {option.automatic
                    ? node
                      ? `Currently ${regionLabel(node.region)} · ${node.id}`
                      : 'Chooses the lowest-latency healthy region'
                    : node?.id}
                </span>
              </span>
              <span
                className={twMerge(
                  'shrink-0 font-mono text-xs tabular-nums text-neutral-400',
                  option.latencyMs !== null && option.available && 'text-neutral-200'
                )}
              >
                {latencyLabel(option.latencyMs, option.available)}
              </span>
            </div>
          )
        }}
      />
      <p className="mt-2 text-xs text-neutral-500">
        {selectedNodeId === null
          ? bestNode
            ? `Automatic currently prefers ${regionLabel(bestNode.region)} at ${nodeLatency(bestNode)} ms.`
            : 'Automatic chooses the lowest-latency healthy region when one is reachable.'
          : 'Manual region selection overrides automatic latency routing.'}
      </p>
    </div>
  )
}
