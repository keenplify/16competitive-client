import { Annoyed, Frown, Laugh, LoaderCircle, Meh, Smile } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import { toast } from 'react-toastify'
import type { MatchmakingMode } from '../../../../shared/matchmaking'
import { getMatchmakingModeLabel } from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../auth/auth.store'
import {
  deferMatchSurveyForSession,
  isMatchSurveyDeferredForSession
} from './match-survey-session'

const surveyFaces = [Frown, Annoyed, Meh, Smile, Laugh] as const

interface MatchSurveyPromptProps {
  matchId: string
  mapDisplayName: string
  mode: string
  onAnswered?: () => void
  onDeferred?: () => void
}

export function MatchSurveyPrompt({
  matchId,
  mapDisplayName,
  mode,
  onAnswered,
  onDeferred
}: MatchSurveyPromptProps): JSX.Element | null {
  const refreshSession = useAuthStore((state) => state.refreshSession)
  const [funRating, setFunRating] = useState<number | null>(null)
  const [fairnessRating, setFairnessRating] = useState<number | null>(null)
  const [status, setStatus] = useState<'loading' | 'pending' | 'submitting' | 'submitted'>(
    () => (isMatchSurveyDeferredForSession() ? 'submitted' : 'loading')
  )

  useEffect(() => {
    if (isMatchSurveyDeferredForSession()) {
      return
    }

    let active = true
    void window.api.matchHistory
      .getSurvey(matchId)
      .then(({ eligible, survey }) => {
        if (!active) return
        if (!eligible || survey) {
          setStatus('submitted')
        } else {
          setStatus('pending')
        }
      })
      .catch(() => {
        if (active) setStatus('submitted')
      })

    return () => {
      active = false
    }
  }, [matchId])

  if (status === 'loading' || status === 'submitted') return null

  const defer = (): void => {
    deferMatchSurveyForSession()
    setStatus('submitted')
    onDeferred?.()
  }

  const submit = (): void => {
    if (funRating === null || fairnessRating === null || status === 'submitting') return
    setStatus('submitting')
    void window.api.matchHistory
      .submitSurvey(matchId, funRating, fairnessRating)
      .then((result) => {
        setStatus('submitted')
        void refreshSession()
        const reward = result.pointsAwarded > 0 ? ' · +' + result.pointsAwarded + ' Points' : ''
        toast.success(
          'Thanks for rating ' +
            mapDisplayName +
            ' · ' +
            getMatchmakingModeLabel(mode as MatchmakingMode) +
            reward
        )
        onAnswered?.()
      })
      .catch((reason: unknown) => {
        setStatus('pending')
        toast.error(reason instanceof Error ? reason.message : 'Could not save your map feedback.')
      })
  }

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-30 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2">
      <section
        className="match-survey-enter pointer-events-auto border border-sky-300/35 border-l-[3px] border-l-sky-400 bg-neutral-950 px-5 py-4 text-left shadow-[0_12px_28px_rgba(0,0,0,0.7)]"
        aria-label="Map feedback"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] font-bold tracking-[0.18em] text-sky-300 uppercase">
                Map contest feedback
              </p>
              <p className="text-[11px] font-bold tracking-[0.14em] text-amber-300 uppercase">
                +500 Points
              </p>
            </div>
            <p className="mt-1 text-sm font-semibold text-white">
              {mapDisplayName} · {getMatchmakingModeLabel(mode as MatchmakingMode)}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SurveyRating
                label="How fun is this map?"
                value={funRating}
                labels={['Not fun', 'A little fun', 'Okay', 'Fun', 'Very fun']}
                onChange={setFunRating}
              />
              <SurveyRating
                label="How balanced is this map?"
                value={fairnessRating}
                labels={['Very unfair', 'Unfair', 'Neutral', 'Fair', 'Very fair']}
                onChange={setFairnessRating}
              />
            </div>
          </div>
          <div className="flex shrink-0 gap-2 sm:flex-col">
            <Button variant="ghost" disabled={status === 'submitting'} onClick={defer}>
              Not now
            </Button>
            <Button
              disabled={status === 'submitting' || funRating === null || fairnessRating === null}
              onClick={submit}
            >
              {status === 'submitting' ? (
                <>
                  <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  Sending…
                </>
              ) : (
                'Submit'
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function SurveyRating({
  label,
  value,
  labels,
  onChange
}: {
  label: string
  value: number | null
  labels: readonly [string, string, string, string, string]
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <fieldset>
      <legend className="text-xs font-semibold text-neutral-300">{label}</legend>
      <div className="mt-2 flex gap-1.5">
        {surveyFaces.map((Icon, index) => {
          const rating = index + 1
          const selected = value === rating
          return (
            <button
              key={rating}
              type="button"
              className={
                'flex size-9 items-center justify-center border transition focus-visible:outline-2 focus-visible:outline-sky-300 ' +
                (selected
                  ? 'border-sky-300 bg-sky-400/20 text-sky-200'
                  : 'border-white/10 bg-black/20 text-neutral-500 hover:border-white/25 hover:bg-white/5 hover:text-white')
              }
              aria-label={labels[index]}
              aria-pressed={selected}
              title={labels[index]}
              onClick={() => onChange(rating)}
            >
              <Icon className="size-5" aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
