import { useEffect } from 'react'
import { toast } from 'react-toastify'

const MATCH_ABANDON_WARNING = 'MATCH_ABANDON_WARNING'
const MATCH_ABANDON_PENALTY = 'MATCH_ABANDON_PENALTY'

export function MatchAbandonNotice(): null {
  useEffect(() => {
    return window.api.matchmaking.onEvent((event) => {
      if (
        event.type !== 'error' ||
        (event.code !== MATCH_ABANDON_WARNING && event.code !== MATCH_ABANDON_PENALTY)
      ) {
        return
      }

      const options = {
        autoClose: false as const,
        closeOnClick: false,
        toastId: `match-abandon:${event.code}:${event.message}`
      }

      if (event.code === MATCH_ABANDON_PENALTY) {
        toast.error(event.message, options)
      } else {
        toast.warning(event.message, options)
      }
    })
  }, [])

  return null
}
