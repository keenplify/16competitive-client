import { CountryFlag } from '../../components/CountryFlag'
import { useTranslation } from '../i18n/i18n'
import { useEffect, type JSX } from 'react'
import { isWebRuntime } from '../../web-runtime'
import { Check, LoaderCircle, RefreshCw } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { serverIsFull } from '../../../../shared/partner-community'
import { Button } from '../../components/ui/Button'
import { localMapPreviews } from '../matchmaking/map-previews'
import { useCommunityText } from './community-copy'
import { usePartnerServersStore } from './partner-servers.store'
import { usePartnerLaunchStore } from './partner-launch.store'
import { usePartyStore } from '../party/party.store'
import { useAuthStore } from '../auth/auth.store'
const serverPreview = (map: string | null): string | undefined =>
  map && Object.hasOwn(localMapPreviews, map) ? localMapPreviews[map] : undefined
export function PartnerServersPanel({
  disabled = false,
  className
}: {
  disabled?: boolean
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const text = useCommunityText(),
    rows = usePartnerServersStore((s) => s.rows),
    status = usePartnerServersStore((s) => s.status),
    error = usePartnerServersStore((s) => s.error),
    selectedId = usePartnerServersStore((s) => s.selectedId),
    connecting = usePartnerServersStore((s) => s.connecting)
  const party = usePartyStore((s) => s.party)
  const playerId = useAuthStore((s) => s.session?.player.id)
  const groupBusy = usePartnerLaunchStore((s) => s.busy !== 'idle')
  const groupError = usePartnerLaunchStore((s) => s.error)
  const startGroup = usePartnerLaunchStore((s) => s.start)
  const load = usePartnerServersStore((s) => s.load),
    select = usePartnerServersStore((s) => s.select),
    connect = usePartnerServersStore((s) => s.connect)
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (!document.hidden) void load()
    }, 20000)
    return () => window.clearInterval(timer)
  }, [load])
  const selected = rows.find((row) => row.id === selectedId)
  const cs13WebUnavailable = isWebRuntime() && selected?.gameVersion === 'cs13'
  const partyMemberCannotStart = Boolean(party && party.members.length > 1 && party.leaderId !== playerId)
  return (
    <section
      className={twMerge('flex min-h-0 flex-1 flex-col gap-3 pt-3 pb-20', className)}
      aria-label={text('serverSelection')}
    >
      <div className="flex min-h-10 items-center justify-between gap-4">
        <p className="text-xs text-neutral-200">
          {text('pingHint')}{' '}
          {rows.some((server) => server.pingSource === 'api') ? text('pingApi') : ''}
        </p>
        <Button
          variant="ghost"
          disabled={status === 'loading' || connecting}
          onClick={() => void load()}
          className="h-10 shrink-0 gap-2"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {text('refresh')}
        </Button>
      </div>
      <div className="min-h-64 flex-1 overflow-x-auto">
        {rows.length ? (
          <div className="grid h-full min-h-64 auto-cols-[minmax(160px,1fr)] grid-flow-col gap-3">
            {rows.map((server) => (
              <button
                key={server.id}
                type="button"
                aria-pressed={server.id === selectedId}
                disabled={disabled || connecting || server.online === false || serverIsFull(server)}
                onClick={() => select(server.id)}
                className={twMerge(
                  'group relative min-h-64 overflow-hidden border border-white/20 bg-neutral-900 text-left transition hover:border-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-60',
                  server.id === selectedId && 'border-sky-300 ring-2 ring-sky-300/40'
                )}
              >
                {serverPreview(server.map) && (
                  <img
                    src={serverPreview(server.map)}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black via-black/25 to-black/35" />
                <span className="absolute top-3 right-3 text-sm font-semibold tabular-nums text-white">
                  {server.pingMs === null
                    ? '—'
                    : `${server.pingMs} ms${server.pingSource === 'api' ? ' · API' : ''}`}
                </span>
                {server.id === selectedId && (
                  <Check className="absolute top-3 left-3 size-5 text-sky-300" aria-hidden="true" />
                )}
                <div className="absolute inset-x-0 bottom-0 p-4 text-center">
                  <div className="mb-2 flex min-h-4 items-center justify-center gap-2 text-xs text-sky-200">
                    <CountryFlag code={server.countryCode} className="h-4 w-6 object-cover" />
                    <span>{t(`directory.category.${server.category ?? 'other'}`)}</span>
                  </div>
                  <p className="font-audiowide text-sm text-white break-words">{server.name}</p>
                  <p className="mt-1 text-xs text-white/80">{server.gameVersion === 'cs13' ? 'Counter-Strike 1.3' : 'Counter-Strike 1.6'}</p>
                  <p className="mt-2 min-h-5 text-xs text-white/80">
                    {server.online === false
                      ? text('offline')
                      : serverIsFull(server)
                        ? text('full')
                        : server.players === null
                          ? '—'
                          : text('players', {
                              players: server.players,
                              max: server.maxPlayers ?? '—'
                            })}
                  </p>
                  <p className="mt-1 text-xs text-white/65">
                    {server.map ?? `${server.host}:${server.port}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-64 items-center justify-center border border-white/10 bg-neutral-950/60 px-6 text-center text-sm text-neutral-200">
            {status === 'loading'
              ? text('loading')
              : status === 'error'
                ? text('loadError')
                : text('emptyServers')}
          </div>
        )}
      </div>
      <div className="flex min-h-16 items-center justify-between gap-4">
        <p className="text-sm text-neutral-200" role={error ? 'alert' : undefined}>
          {error
            ? text(error as 'loadError' | 'installation' | 'busy' | 'launchFailed')
            : groupError ? text('partyLaunchFailed')
              : partyMemberCannotStart ? text('partyLeaderOnly')
                : cs13WebUnavailable ? text('cs13WebUnavailable') : (selected?.name ?? text('chooseServer'))}
        </p>
        <Button
          className="h-12 min-w-40 shrink-0 gap-2 uppercase"
          disabled={
            disabled ||
            connecting ||
            groupBusy ||
            partyMemberCannotStart ||
            !selected ||
            cs13WebUnavailable ||
            selected.online === false ||
            serverIsFull(selected)
          }
          onClick={() => {
            if (!selected) return
            if (party && party.members.length > 1) void startGroup(selected.id)
            else void connect()
          }}
        >
          {connecting || groupBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {text('play')}
        </Button>
      </div>
    </section>
  )
}
