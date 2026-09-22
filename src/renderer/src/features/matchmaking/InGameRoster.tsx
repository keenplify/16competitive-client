import { useEffect, useState, type JSX, type MouseEvent } from 'react'
import { Flag, UserPlus, UserRound, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'react-toastify'
import { twMerge } from 'tailwind-merge'
import type { PlayerReportReason, QueuedPlayer } from '../../../../shared/matchmaking'
import type { PlayerProfile } from '../../../../shared/match-history'
import { Button } from '../../components/ui/Button'
import { ModalPortal } from '../../components/ui/ModalPortal'
import { preferenceFor, useVoicePreferencesStore } from '../voice/voice-preferences.store'
import { useFriendsStore } from '../friends/friends.store'

const reasons: { value: PlayerReportReason; label: string }[] = [
  { value: 'CHEATING', label: 'Cheating' },
  { value: 'GRIEFING', label: 'Griefing' },
  { value: 'TOXIC_COMMUNICATION', label: 'Toxic communication' },
  { value: 'AFK_THROWING', label: 'AFK or throwing' },
  { value: 'OTHER', label: 'Other' }
]

interface Props {
  matchId: string
  teams: { teamA: QueuedPlayer[]; teamB: QueuedPlayer[] }
  currentPlayerId: string
  className?: string
}

export function InGameRoster({ matchId, teams, currentPlayerId, className }: Props): JSX.Element {
  const preferences = useVoicePreferencesStore((state) => state.preferences)
  const setPreference = useVoicePreferencesStore((state) => state.setPreference)
  const [target, setTarget] = useState<QueuedPlayer | null>(null)
  const [reason, setReason] = useState<PlayerReportReason>('CHEATING')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportedIds, setReportedIds] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<{ playerId: string; x: number; y: number } | null>(
    null
  )
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const friends = useFriendsStore((state) => state.friends)
  const requestFriend = useFriendsStore((state) => state.request)

  useEffect(() => {
    const close = (): void => setContextMenu(null)
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', escape)
    }
  }, [])

  const showMenu = (event: MouseEvent<HTMLElement>, playerId: string): void => {
    event.preventDefault()
    setContextMenu({
      playerId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 176)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 96))
    })
  }

  const openProfile = (playerId: string): void => {
    setContextMenu(null)
    setProfile(null)
    setProfileError(null)
    setProfileLoading(true)
    void window.api.matchHistory
      .getPlayerProfile(playerId)
      .then(setProfile)
      .catch((cause: unknown) =>
        setProfileError(cause instanceof Error ? cause.message : 'Could not load player profile.')
      )
      .finally(() => setProfileLoading(false))
  }

  const addFriend = (playerId: string): void => {
    setContextMenu(null)
    void requestFriend(playerId).then(() => {
      const { error, notice } = useFriendsStore.getState()
      if (error) toast.error(error)
      else if (notice) toast.success(notice)
    })
  }

  const submit = async (): Promise<void> => {
    if (!target || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await window.api.matchmaking.reportPlayer(matchId, target.id, reason, description)
      setReportedIds((ids) => [...ids, target.id])
      setTarget(null)
      setDescription('')
      toast.success('Player report submitted. Thank you!')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit the report.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className={twMerge('grid gap-4 md:grid-cols-2', className)}>
        {(
          [
            ['Team A', teams.teamA],
            ['Team B', teams.teamB]
          ] as const
        ).map(([name, players]) => (
          <section key={name} className="rounded-xl border border-white/10 bg-neutral-900/90 p-5">
            <h2 className="mb-4 text-xs font-bold tracking-[0.18em] text-neutral-400 uppercase">
              {name}
            </h2>
            <ul className="space-y-2">
              {players.map((player) => {
                const own = player.id === currentPlayerId
                const preference = preferenceFor(preferences, player.id)
                return (
                  <li
                    key={player.id}
                    className="flex min-h-14 flex-wrap items-center gap-3 rounded-lg bg-black/25 px-3 py-2"
                    onContextMenu={(event) => showMenu(event, player.id)}
                  >
                    <span
                      className="min-w-24 flex-1 truncate text-left text-sm font-medium"
                      title={player.username}
                    >
                      {player.username}
                      {own && <span className="ml-2 text-xs text-sky-300">You</span>}
                    </span>
                    {!own && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-400"
                          aria-label={`${preference.muted ? 'Unmute' : 'Mute'} ${player.username}`}
                          aria-pressed={preference.muted}
                          onClick={() =>
                            setPreference(player.id, { ...preference, muted: !preference.muted })
                          }
                        >
                          {preference.muted ? (
                            <VolumeX className="size-4" />
                          ) : (
                            <Volume2 className="size-4" />
                          )}
                        </button>
                        <label className="flex items-center gap-2 text-xs text-neutral-400">
                          <span className="sr-only">{player.username} volume</span>
                          <input
                            aria-label={`${player.username} volume`}
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(preference.volume * 100)}
                            disabled={preference.muted}
                            className="w-20 accent-sky-400 disabled:opacity-40 sm:w-24"
                            onChange={(event) =>
                              setPreference(player.id, {
                                ...preference,
                                volume: Number(event.target.value) / 100
                              })
                            }
                          />
                          <span className="w-8 text-right tabular-nums">
                            {Math.round(preference.volume * 100)}%
                          </span>
                        </label>
                        <button
                          type="button"
                          disabled={reportedIds.includes(player.id)}
                          className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:bg-red-400/10 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-40"
                          aria-label={`Report ${player.username}`}
                          title={reportedIds.includes(player.id) ? 'Reported' : 'Report player'}
                          onClick={() => {
                            setTarget(player)
                            setError(null)
                            setDescription('')
                            setReason('CHEATING')
                          }}
                        >
                          <Flag className="size-4" />
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      {contextMenu && (
        <div
          role="menu"
          className="fixed z-[110] min-w-40 rounded-lg border border-white/15 bg-neutral-800 py-1 text-left text-white shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-white/10"
            onClick={() => openProfile(contextMenu.playerId)}
          >
            <UserRound className="size-4 text-sky-300" />
            View profile
          </button>
          {contextMenu.playerId !== currentPlayerId && (
            <button
              type="button"
              role="menuitem"
              disabled={friends.some((friend) => friend.id === contextMenu.playerId)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
              onClick={() => addFriend(contextMenu.playerId)}
            >
              <UserPlus className="size-4 text-emerald-300" />
              {friends.some((friend) => friend.id === contextMenu.playerId)
                ? 'Already friends'
                : 'Add friend'}
            </button>
          )}
        </div>
      )}
      {(profile || profileLoading || profileError) && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Player profile"
              className="w-full max-w-md rounded-xl border border-white/15 bg-neutral-900 p-6 text-white shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-semibold">{profile?.username ?? 'Player profile'}</h2>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setProfile(null)
                    setProfileError(null)
                    setProfileLoading(false)
                  }}
                >
                  Close
                </Button>
              </div>
              {profileLoading && <p className="mt-5 text-sm text-neutral-400">Loading profile…</p>}
              {profileError && (
                <p role="alert" className="mt-5 text-sm text-red-300">
                  {profileError}
                </p>
              )}
              {profile && (
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  {(
                    [
                      ['MMR', profile.mmr],
                      ['Wins', profile.wins],
                      ['Losses', profile.losses],
                      ['K / A / D', `${profile.kills} / ${profile.assists} / ${profile.deaths}`]
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-neutral-400">{label}</dt>
                      <dd className="mt-1 font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          </div>
        </ModalPortal>
      )}
      {target && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !submitting) setTarget(null)
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="player-report-title"
              className="w-full max-w-md rounded-xl border border-white/15 bg-neutral-900 p-6 text-white shadow-2xl"
            >
              <h2 id="player-report-title" className="text-xl font-semibold">
                Report {target.username}
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                Choose a reason and describe what happened in this match.
              </p>
              <p className="mt-2 text-xs text-neutral-400">
                You can also report a player in game by typing{' '}
                <kbd className="font-mono text-sky-300">/report</kbd> in chat.
              </p>
              <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submit()
                }}
              >
                <label className="block text-sm">
                  Reason
                  <select
                    className="mt-2 w-full rounded-md border border-white/15 bg-neutral-800 px-3 py-2"
                    value={reason}
                    onChange={(event) => setReason(event.target.value as PlayerReportReason)}
                  >
                    {reasons.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Description
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-md border border-white/15 bg-neutral-800 px-3 py-2"
                    value={description}
                    minLength={3}
                    maxLength={300}
                    required
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                {error && (
                  <p role="alert" className="text-sm text-red-300">
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={submitting}
                    onClick={() => setTarget(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting || description.trim().length < 3}>
                    {submitting ? 'Sending…' : 'Submit report'}
                  </Button>
                </div>
              </form>
            </section>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
