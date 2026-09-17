import { useEffect, useState, type ReactNode } from 'react'
import type { DeviceBanStatus, DeviceStatus } from '../../../../shared/anti-cheat'

const ANTI_CHEAT_CANCELLED_MESSAGE =
  'This game was cancelled because the server detected cheating.'

const formatBanDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function DeviceBanGate({ children }: { children: ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<DeviceStatus | null>(null)

  useEffect(() => {
    let active = true
    const refreshStatus = (): void => {
      void window.api.antiCheat
        .getDeviceStatus()
        .then((result) => {
          if (active) setStatus(result)
        })
        .catch(() => {
          if (active) setStatus((current) => current ?? { banned: false })
        })
    }

    refreshStatus()
    const removeMatchmakingListener = window.api.matchmaking.onEvent((event) => {
      if (
        event.type === 'match_cancelled' &&
        event.message === ANTI_CHEAT_CANCELLED_MESSAGE
      ) {
        refreshStatus()
      }
    })

    return () => {
      active = false
      removeMatchmakingListener()
    }
  }, [])

  if (status === null) {
    return <div style={{ position: 'fixed', inset: 0, background: '#080808' }} />
  }

  if (status.banned) {
    const ban = status as DeviceBanStatus
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100000,
          display: 'grid',
          placeItems: 'center',
          background: '#080808',
          color: '#f5f5f5',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: 32
        }}
      >
        <div style={{ width: 'min(680px, 100%)', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-block',
              padding: '6px 12px',
              border: '1px solid rgba(255,255,255,.16)',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 24
            }}
          >
            1.6 Competitive Anti-Cheat
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(32px, 5vw, 56px)', lineHeight: 1.05 }}>
            You are banned until {formatBanDate(ban.displayUntil)}.
          </h1>
          <p style={{ margin: '24px 0 0', fontSize: 18, color: '#b8b8b8', lineHeight: 1.6 }}>
            To appeal, message {ban.appealEmail}.
          </p>
          <p style={{ margin: '18px 0 0', fontSize: 14, color: '#777' }}>
            Offense {ban.offenseCount} · {ban.reason}
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
