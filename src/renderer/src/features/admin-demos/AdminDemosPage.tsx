import { Button } from '../../components/ui/Button'
import { useAdminDemosStore } from './admin-demos.store'
export function AdminDemosPage(): React.JSX.Element {
  const state = useAdminDemosStore()
  return (
    <section className="mx-auto max-w-5xl space-y-4 p-6 text-white">
      <h1 className="text-2xl font-bold">Admin demos</h1>
      <p className="text-sm text-white/60">
        Watch retained anti-cheat recordings in Counter-Strike. Close CS before starting playback.
        Playback is unavailable while queued or in a match.
      </p>
      <Button
        disabled={state.loading || !!state.watching}
        onClick={() => void state.load(state.page)}
      >
        Refresh
      </Button>
      {state.error && (
        <p role="alert" className="text-red-300">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
      {!state.allowed ? (
        <p>Administrator access required.</p>
      ) : (
        <>
          {state.loading ? (
            <p>Loading demos…</p>
          ) : !state.rows.length ? (
            <p>No retained demos yet.</p>
          ) : (
            state.rows.map((row) => (
              <article
                key={row.id}
                className="flex items-center justify-between gap-4 border border-white/15 p-4"
              >
                <div>
                  <h2 className="font-bold">{row.username}</h2>
                  <p className="text-sm text-white/60">
                    {new Date(row.requestedAt).toLocaleString()} · {row.status}
                    {row.sizeBytes ? ` · ${(row.sizeBytes / 1048576).toFixed(1)} MB` : ''}
                  </p>
                  <p className="text-xs text-white/50">Match {row.matchId}</p>
                </div>
                <Button
                  disabled={row.status !== 'READY' || !!state.watching}
                  onClick={() => void state.watch(row.id)}
                >
                  {state.watching === row.id ? 'Preparing…' : 'Watch demo'}
                </Button>
              </article>
            ))
          )}
          <div className="flex gap-3">
            <Button
              disabled={state.page <= 1 || state.loading || !!state.watching}
              onClick={() => void state.load(state.page - 1)}
            >
              Previous
            </Button>
            <span>Page {state.page}</span>
            <Button
              disabled={!state.hasMore || state.loading || !!state.watching}
              onClick={() => void state.load(state.page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
