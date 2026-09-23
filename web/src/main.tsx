import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://16competitive.papamo.dev').replace(/\/$/, '')
const DESKTOP_DOWNLOAD_URL = 'https://www.papamo.dev/16competitive'
const TOKEN_KEY = '16competitive.web.session'

type Player = { id: string; username: string; mmr: number; points?: number }
type AuthResponse = { token: string; expiresAt: string; player: Player }
type MapInfo = { id: string; displayName: string; previewUrl: string | null; supportedModes: string[] }
type NodeInfo = { id: string; region: string; publicApiUrl: string; available: boolean }
type Match = {
  matchId: string
  mode: string
  mapId: string
  region: string
  hostApiUrl: string
  teams: { teamA: Player[]; teamB: Player[] }
}
type Connection = { matchId: string; host: string; port: number; password: string; joinToken: string }

const isMobileOrTablet = () =>
  /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) ||
  (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1100)

const websocketUrl = (apiUrl: string) => {
  const url = new URL(apiUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/matchmaking/ws'
  url.search = ''
  url.hash = ''
  return url.toString()
}

const steamLaunchUrl = (connection: Connection) => {
  const args =
    `+setinfo "_16c" "${connection.joinToken}" +password "${connection.password}" +connect ${connection.host}:${connection.port}`
  return `steam://run/10//${encodeURIComponent(args)}/`
}

function MobileGate() {
  return <main className="mobile-gate">Please use a desktop</main>
}

function RankedUpsell({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ranked-title">
      <section className="modal-card">
        <p className="eyebrow">Competitive Ranked</p>
        <h2 id="ranked-title">Ranked requires the 1.6 Competitive app</h2>
        <p className="muted">
          The browser is intentionally limited to Steam-only Unrated. Install the desktop app to
          unlock the full competitive experience.
        </p>
        <div className="benefits">
          <div><strong>MMR + Rank</strong><span>Rated matches and leaderboard progression.</span></div>
          <div><strong>Native anti-cheat</strong><span>Local checks and match evidence integration.</span></div>
          <div><strong>Automatic skins</strong><span>Models, sounds and match assets synced for you.</span></div>
          <div><strong>Voice + PTT</strong><span>Integrated team and party voice controls.</span></div>
          <div><strong>Discord presence</strong><span>Lobby, party, map and in-game status.</span></div>
          <div><strong>Game monitoring</strong><span>One-click launching, reconnect and process recovery.</span></div>
        </div>
        <div className="modal-actions">
          <a className="primary-button" href={DESKTOP_DOWNLOAD_URL}>Install 1.6 Competitive</a>
          <button className="secondary-button" onClick={onClose}>Keep playing Unrated</button>
        </div>
      </section>
    </div>
  )
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [player, setPlayer] = useState<Player | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authError, setAuthError] = useState('')
  const [maps, setMaps] = useState<MapInfo[]>([])
  const [nodes, setNodes] = useState<NodeInfo[]>([])
  const [selectedMaps, setSelectedMaps] = useState<string[]>([])
  const [selectedNode, setSelectedNode] = useState<string>('')
  const [status, setStatus] = useState('idle')
  const [statusText, setStatusText] = useState('Ready')
  const [queueInfo, setQueueInfo] = useState({ queuedPlayers: 0, playersRequired: 10, position: 0 })
  const [match, setMatch] = useState<Match | null>(null)
  const [readyDeadline, setReadyDeadline] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<string[]>([])
  const [connection, setConnection] = useState<Connection | null>(null)
  const [showRankedUpsell, setShowRankedUpsell] = useState(false)
  const [error, setError] = useState('')
  const socketRef = useRef<WebSocket | null>(null)
  const socketApiRef = useRef(API_BASE_URL)

  const selectedRegion = useMemo(
    () => nodes.find((node) => node.id === selectedNode && node.available) ?? nodes.find((node) => node.available),
    [nodes, selectedNode]
  )

  const authHeaders = (value = token) => ({ authorization: `Bearer ${value}` })

  const apiJson = async <T,>(path: string, init: RequestInit = {}, apiBase = API_BASE_URL): Promise<T> => {
    const response = await fetch(`${apiBase}${path}`, init)
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const message = body && typeof body.message === 'string' ? body.message : `Request failed (${response.status})`
      throw new Error(message)
    }
    return body as T
  }

  const connectSocket = (apiBase: string, currentToken = token) => {
    if (!currentToken) return
    if (socketRef.current) socketRef.current.close()
    socketApiRef.current = apiBase
    const socket = new WebSocket(websocketUrl(apiBase))
    socketRef.current = socket
    setStatusText('Connecting…')

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'authenticate', token: currentToken, client: 'web' }))
    })
    socket.addEventListener('message', (event) => {
      let message: any
      try { message = JSON.parse(String(event.data)) } catch { return }

      if (message.type === 'authenticated') {
        setPlayer(message.player)
        setStatusText('Connected')
        socket.send(JSON.stringify({ type: 'get_queue_status' }))
        return
      }
      if (message.type === 'queue_joined' || message.type === 'queue_status') {
        setStatus('queued')
        setStatusText('Searching for an Unrated match…')
        setQueueInfo({
          queuedPlayers: message.queuedPlayers ?? 0,
          playersRequired: message.playersRequired ?? 10,
          position: message.position ?? 0
        })
        return
      }
      if (message.type === 'queue_left') {
        setStatus('idle')
        setStatusText('Ready')
        return
      }
      if (message.type === 'match_found' || message.type === 'match_roster') {
        setMatch(message)
        setStatus('match_found')
        setStatusText('Match found')
        if (message.hostApiUrl && new URL(message.hostApiUrl).origin !== new URL(socketApiRef.current).origin) {
          window.setTimeout(() => connectSocket(message.hostApiUrl, currentToken), 50)
        }
        return
      }
      if (message.type === 'match_ready_check') {
        setStatus('ready_check')
        setReadyDeadline(message.deadline)
        setAccepted(message.acceptedPlayerIds || [])
        setStatusText('Accept your match')
        return
      }
      if (message.type === 'match_ready_updated') {
        setAccepted(message.acceptedPlayerIds || [])
        return
      }
      if (message.type === 'match_countdown') {
        setStatus('countdown')
        setStatusText(`Starting in ${message.secondsRemaining}…`)
        return
      }
      if (message.type === 'match_server_starting') {
        setStatus('starting')
        setStatusText('Starting server…')
        return
      }
      if (message.type === 'match_connect') {
        setConnection(message)
        setStatus('server_ready')
        setStatusText('Server ready')
        return
      }
      if (message.type === 'match_finished') {
        setStatus('idle')
        setMatch(null)
        setConnection(null)
        setReadyDeadline(null)
        setAccepted([])
        setStatusText('Match finished. MMR unchanged.')
        void restoreSession(currentToken)
        return
      }
      if (message.type === 'match_cancelled') {
        setStatus('idle')
        setMatch(null)
        setConnection(null)
        setReadyDeadline(null)
        setError(message.message || 'Match cancelled')
        setStatusText('Ready')
        return
      }
      if (message.type === 'error') {
        if (message.code === 'NOT_QUEUED') return
        setError(message.message || 'Matchmaking error')
      }
    })
    socket.addEventListener('close', () => setStatusText('Disconnected'))
  }

  const restoreSession = async (currentToken = token) => {
    if (!currentToken) return
    try {
      const session = await apiJson<{ player: Player }>('/auth/session', { headers: authHeaders(currentToken) })
      setPlayer(session.player)
      const [mapResponse, nodeResponse] = await Promise.all([
        apiJson<{ maps: MapInfo[] }>('/matchmaking/maps', { headers: authHeaders(currentToken) }),
        apiJson<{ nodes: NodeInfo[] }>('/nodes', { headers: authHeaders(currentToken) })
      ])
      const unratedMaps = mapResponse.maps.filter((map) => map.supportedModes.includes('unrated'))
      setMaps(unratedMaps)
      setNodes(nodeResponse.nodes)
      setSelectedMaps((current) => current.length ? current.filter((id) => unratedMaps.some((map) => map.id === id)) : unratedMaps.map((map) => map.id))
      const firstNode = nodeResponse.nodes.find((node) => node.available)
      if (firstNode) setSelectedNode((current) => current || firstNode.id)
      connectSocket(firstNode?.publicApiUrl || API_BASE_URL, currentToken)
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      setToken('')
      setPlayer(null)
    }
  }

  useEffect(() => {
    if (token) void restoreSession(token)
    return () => socketRef.current?.close()
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js')
  }, [])

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthError('')
    const data = new FormData(event.currentTarget)
    const payload: Record<string, string> = {
      username: String(data.get('username') || ''),
      password: String(data.get('password') || '')
    }
    if (authMode === 'register') payload.email = String(data.get('email') || '')
    try {
      const result = await apiJson<AuthResponse>(`/auth/${authMode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      localStorage.setItem(TOKEN_KEY, result.token)
      setToken(result.token)
      setPlayer(result.player)
      await restoreSession(result.token)
    } catch (reason) {
      setAuthError(reason instanceof Error ? reason.message : 'Authentication failed')
    }
  }

  const logout = () => {
    socketRef.current?.close()
    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setPlayer(null)
    setMatch(null)
    setConnection(null)
    setStatus('idle')
  }

  const queueUnrated = () => {
    setError('')
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError('Matchmaking is not connected.')
      return
    }
    if (selectedMaps.length === 0) {
      setError('Select at least one map.')
      return
    }
    const region = selectedRegion?.region
    socketRef.current.send(JSON.stringify({
      type: 'join_queue',
      mode: 'unrated',
      mapIds: selectedMaps,
      preferredRegion: region,
      eligibleRegions: region ? [region] : undefined,
      allowRegionExpansion: true
    }))
    setStatusText('Joining Unrated…')
  }

  const leaveQueue = () => socketRef.current?.send(JSON.stringify({ type: 'leave_queue' }))

  const respondReady = (acceptedResponse: boolean) => {
    if (!match) return
    socketRef.current?.send(JSON.stringify({
      type: 'match_ready_response',
      matchId: match.matchId,
      accepted: acceptedResponse
    }))
  }

  if (isMobileOrTablet()) return <MobileGate />

  if (!player) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">1.6 Competitive Web</p>
          <h1>Play CS 1.6 without installing our launcher</h1>
          <p className="muted">Steam-only Unrated matchmaking. Ranked and native features stay in the desktop app.</p>
          <form onSubmit={submitAuth}>
            <input name="username" autoComplete="username" placeholder="Username" required minLength={3} />
            {authMode === 'register' && <input name="email" type="email" autoComplete="email" placeholder="Email" required />}
            <input name="password" type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} placeholder="Password" required minLength={8} />
            {authError && <p className="error">{authError}</p>}
            <button className="primary-button" type="submit">{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          <button className="link-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
          </button>
        </section>
      </main>
    )
  }

  const secondsRemaining = readyDeadline ? Math.max(0, Math.ceil((Date.parse(readyDeadline) - Date.now()) / 1000)) : 0

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">1.6 Competitive</p>
          <strong>{player.username}</strong>
          <span className="mmr">{player.mmr} MMR</span>
        </div>
        <div className="topbar-actions">
          <span className="status-dot" /> {statusText}
          <button className="link-button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Desktop Web / PWA</p>
          <h1>Steam-only CS 1.6 matchmaking</h1>
          <p className="muted">Jump into Unrated from your browser. Same 5v5 competitive rules, no MMR change.</p>
        </div>
        <div className="mode-grid">
          <button className="mode-card active" onClick={queueUnrated} disabled={status !== 'idle'}>
            <span>UNRATED</span>
            <strong>Play from browser</strong>
            <small>Steam required · No MMR change</small>
          </button>
          <button className="mode-card ranked" onClick={() => setShowRankedUpsell(true)}>
            <span>COMPETITIVE</span>
            <strong>Ranked + MMR</strong>
            <small>Requires 1.6 Competitive desktop app</small>
          </button>
        </div>
      </section>

      {status === 'idle' || status === 'queued' ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Unrated</p>
              <h2>Choose your maps</h2>
            </div>
            <select value={selectedNode} onChange={(event) => setSelectedNode(event.target.value)} disabled={status === 'queued'}>
              {nodes.filter((node) => node.available).map((node) => <option key={node.id} value={node.id}>{node.region}</option>)}
            </select>
          </div>
          <div className="maps">
            {maps.map((map) => {
              const selected = selectedMaps.includes(map.id)
              return (
                <button
                  key={map.id}
                  className={`map-card ${selected ? 'selected' : ''}`}
                  disabled={status === 'queued'}
                  onClick={() => setSelectedMaps((current) => selected ? current.filter((id) => id !== map.id) : [...current, map.id])}
                >
                  <strong>{map.displayName}</strong>
                  <small>{map.id}</small>
                </button>
              )
            })}
          </div>
          <div className="queue-bar">
            {status === 'queued' ? (
              <>
                <div><strong>Searching…</strong><span>{queueInfo.queuedPlayers}/{queueInfo.playersRequired} queued{queueInfo.position ? ` · Position ${queueInfo.position}` : ''}</span></div>
                <button className="secondary-button" onClick={leaveQueue}>Cancel</button>
              </>
            ) : (
              <>
                <div><strong>Steam required</strong><span>CS 1.6 must be installed through Steam.</span></div>
                <button className="primary-button" onClick={queueUnrated}>Find Unrated Match</button>
              </>
            )}
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      ) : (
        <section className="panel match-panel">
          <p className="eyebrow">{status === 'ready_check' ? 'Ready check' : 'Match found'}</p>
          <h2>{match?.mapId || 'Preparing match'}</h2>
          {match && (
            <div className="teams">
              <div><strong>Team A</strong>{match.teams.teamA.map((p) => <span key={p.id}>{p.username}</span>)}</div>
              <div><strong>Team B</strong>{match.teams.teamB.map((p) => <span key={p.id}>{p.username}</span>)}</div>
            </div>
          )}
          {status === 'ready_check' && match && (
            <div className="ready-actions">
              <p>{accepted.length}/10 accepted · {secondsRemaining}s</p>
              <button className="primary-button" onClick={() => respondReady(true)}>Accept</button>
              <button className="secondary-button" onClick={() => respondReady(false)}>Decline</button>
            </div>
          )}
          {(status === 'countdown' || status === 'starting') && <p className="muted">{statusText}</p>}
          {status === 'server_ready' && connection && (
            <div className="launch-box">
              <h3>Your server is ready</h3>
              <p className="muted">Steam will open Counter-Strike 1.6 and pass your match token, password and server address.</p>
              <a className="primary-button launch-button" href={steamLaunchUrl(connection)}>Launch Counter-Strike</a>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      )}

      {showRankedUpsell && <RankedUpsell onClose={() => setShowRankedUpsell(false)} />}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
