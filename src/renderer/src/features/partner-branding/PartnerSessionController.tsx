import { useEffect, useState, type JSX } from 'react'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import { usePartnerLaunchStore } from './partner-launch.store'
import { usePartnerPresenceStore } from './partner-presence.store'
import { usePartnerLaunchText } from './partner-launch-copy'
import { useNavigationStore } from '../navigation/navigation.store'

export function PartnerSessionController(): JSX.Element {
  const accountId = useAuthStore((state) => state.session?.player.id ?? null)
  const group = usePartnerLaunchStore((state) => state.group)
  const busy = usePartnerLaunchStore((state) => state.busy)
  const error = usePartnerLaunchStore((state) => state.error)
  const refreshGroup = usePartnerLaunchStore((state) => state.refresh)
  const respond = usePartnerLaunchStore((state) => state.respond)
  const launch = usePartnerLaunchStore((state) => state.launch)
  const dismiss = usePartnerLaunchStore((state) => state.dismiss)
  const refreshPresence = usePartnerPresenceStore((state) => state.refresh)
  const clearPresence = usePartnerPresenceStore((state) => state.clear)
  const confirmedConnectionId = usePartnerPresenceStore((state) =>
    state.accountId === accountId ? state.presence?.connectionId : null
  )
  const text = usePartnerLaunchText()
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (confirmedConnectionId) useNavigationStore.getState().navigate('play')
  }, [confirmedConnectionId])

  useEffect(() => {
    if (!accountId) {
      dismiss()
      clearPresence()
      return
    }
    void refreshGroup()
    void refreshPresence()
    const timer = window.setInterval(() => {
      setNow(Date.now())
      void refreshGroup()
      void refreshPresence()
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [accountId, refreshGroup, refreshPresence, dismiss, clearPresence])

  const self = group?.members.find((member) => member.id === accountId)
  useEffect(() => {
    if (group?.status === 'ready' && self?.accepted && !self.launched && busy === 'idle' && !error)
      void launch()
  }, [group, self?.accepted, self?.launched, busy, error, launch])

  const expired = group ? Date.parse(group.expiresAt) <= now : false
  const status = expired ? 'cancelled' : group?.status

  return (
    <ModalDialog
      open={Boolean(group)}
      onClose={() => {
        if (status === 'pending' && self?.accepted === null) void respond(false)
        else dismiss()
      }}
      labelledBy="partner-ready-title"
      className="max-w-lg p-6"
    >
      <p className="text-xs font-bold tracking-widest text-sky-300 uppercase">{text('title')}</p>
      <h2 id="partner-ready-title" className="mt-2 text-2xl font-semibold">
        {group?.server.name}
      </h2>
      <p className="mt-2 min-h-10 text-sm text-neutral-300">
        {text('description', { server: group?.server.name ?? '' })}
      </p>
      <p className="mt-4 text-xs text-neutral-400" role="status">
        {status === 'pending'
          ? text('waiting')
          : status === 'ready'
            ? text('ready')
            : text('cancelled')}
        {status === 'pending' && group
          ? ` · ${text('seconds', { seconds: Math.max(0, Math.ceil((Date.parse(group.expiresAt) - now) / 1_000)) })}`
          : ''}
      </p>
      <div className="mt-4 grid gap-2">
        {group?.members.map((member) => (
          <div
            key={member.id}
            className="flex min-h-10 items-center justify-between border border-white/10 px-3 text-sm"
          >
            <span className="truncate">{member.username}</span>
            <span className="text-neutral-400">
              {member.accepted ? text('accepted') : text('pending')}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 min-h-5 text-xs text-red-300" role={error ? 'alert' : undefined}>
        {error ? text('error') : ''}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {status === 'pending' && self?.accepted === null ? (
          <>
            <Button disabled={busy !== 'idle'} onClick={() => void respond(true)}>
              {text('accept')}
            </Button>
            <Button variant="ghost" disabled={busy !== 'idle'} onClick={() => void respond(false)}>
              {text('decline')}
            </Button>
          </>
        ) : status === 'ready' && error ? (
          <Button disabled={busy !== 'idle'} onClick={() => void launch()}>
            {text('retry')}
          </Button>
        ) : status === 'cancelled' ? (
          <Button onClick={dismiss}>{text('close')}</Button>
        ) : (
          <Button disabled>{busy === 'launching' ? text('connecting') : text('waiting')}</Button>
        )}
      </div>
    </ModalDialog>
  )
}
