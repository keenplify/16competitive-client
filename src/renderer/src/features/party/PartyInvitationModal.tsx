import type { JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { usePartyStore } from './party.store'

export function PartyInvitationModal(): JSX.Element | null {
  const invitations = usePartyStore((state) => state.invitations)
  const status = usePartyStore((state) => state.status)
  const respond = usePartyStore((state) => state.respond)

  if (invitations.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="party-invitation-title"
    >
      <section className="w-full max-w-md rounded-xl border border-white/15 bg-neutral-900 p-6 shadow-2xl">
        <p className="text-xs font-bold tracking-[0.18em] text-sky-400 uppercase">Party</p>
        <h2 id="party-invitation-title" className="mt-2 text-2xl font-semibold">
          Party invitation
        </h2>
        <p className="mt-2 text-sm text-neutral-400">
          Accept an invitation to join that player’s lobby.
        </p>

        <div className="mt-6 grid gap-3">
          {invitations.map((invitation) => (
            <article
              key={invitation.id}
              className="rounded-lg border border-white/10 bg-black/20 p-4"
            >
              <p className="text-sm text-neutral-400">
                <span className="font-semibold text-white">{invitation.inviter.username}</span>{' '}
                invited you to their party.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  disabled={status === 'responding'}
                  onClick={() => void respond(invitation.id, 'accept')}
                >
                  {status === 'responding' ? 'Responding…' : 'Accept'}
                </Button>
                <Button
                  className="border border-white/10"
                  variant="ghost"
                  disabled={status === 'responding'}
                  onClick={() => void respond(invitation.id, 'decline')}
                >
                  Decline
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
