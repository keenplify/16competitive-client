import { useEffect, useState, type JSX } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Volume2,
  VolumeX
} from 'lucide-react'
import { useAuthStore } from '../auth/auth.store'
import { usePartyStore } from '../party/party.store'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { useVoiceStore } from './voice.store'

const stateLabel = {
  disabled: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Voice error'
} as const

export function VoiceChatPanel(): JSX.Element | null {
  const playerId = useAuthStore((state) => state.session?.player.id)
  const party = usePartyStore((state) => state.party)
  const match = useMatchmakingStore((state) => state.match)
  const connectionDetails = useMatchmakingStore((state) => state.connectionDetails)
  const connectionState = useVoiceStore((state) => state.connectionState)
  const room = useVoiceStore((state) => state.room)
  const peers = useVoiceStore((state) => state.peers)
  const micMode = useVoiceStore((state) => state.micMode)
  const microphoneReady = useVoiceStore((state) => state.microphoneReady)
  const error = useVoiceStore((state) => state.error)
  const initialize = useVoiceStore((state) => state.initialize)
  const connect = useVoiceStore((state) => state.connect)
  const disconnect = useVoiceStore((state) => state.disconnect)
  const sync = useVoiceStore((state) => state.sync)
  const setMicMode = useVoiceStore((state) => state.setMicMode)
  const setPeerVolume = useVoiceStore((state) => state.setPeerVolume)
  const togglePeerMuted = useVoiceStore((state) => state.togglePeerMuted)
  const [minimized, setMinimized] = useState(false)

  useEffect(() => {
    if (playerId) initialize(playerId)
  }, [initialize, playerId])

  useEffect(() => {
    if (!playerId) return
    void sync().catch(() => undefined)
  }, [connectionDetails?.matchId, match?.matchId, party?.id, party?.members.length, playerId, sync])

  if (!playerId) return null
  const hasVoiceContext = Boolean(room || match || connectionDetails || (party && party.members.length > 1))
  if (!hasVoiceContext && connectionState !== 'error') return null

  const title = room?.scope === 'match_team' ? 'Team Voice' : 'Party Voice'
  const active = connectionState !== 'disabled'

  return (
    <aside className="fixed right-5 bottom-5 z-[80] w-[min(25rem,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-white/15 bg-neutral-950/95 text-white shadow-2xl backdrop-blur">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span
          className={`size-2 rounded-full ${connectionState === 'connected' ? 'bg-emerald-400' : 'bg-neutral-500'}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="truncate text-[11px] text-neutral-400">
            {stateLabel[connectionState]}
            {room ? ` · ${peers.length} ${peers.length === 1 ? 'player' : 'players'}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white"
          aria-label={minimized ? 'Expand voice chat' : 'Minimize voice chat'}
          onClick={() => setMinimized((value) => !value)}
        >
          {minimized ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
      </header>

      {!minimized && (
        <div className="p-4">
          <div className="flex items-center gap-2">
            {active ? (
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-400/20"
                onClick={() => void disconnect()}
              >
                <PhoneOff size={15} /> Disconnect
              </button>
            ) : (
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/20"
                onClick={() => void connect()}
              >
                <PhoneCall size={15} /> Reconnect
              </button>
            )}

            <button
              type="button"
              disabled={!active}
              className="ml-auto flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-200 disabled:opacity-50"
              onClick={() => setMicMode(micMode === 'open_mic' ? 'push_to_talk' : 'open_mic')}
            >
              {micMode === 'open_mic' ? <Mic size={15} /> : <MicOff size={15} />}
              {micMode === 'open_mic' ? 'Open mic' : 'Push to talk'}
            </button>
          </div>

          {active && !microphoneReady && room && peers.length > 0 && (
            <p className="mt-3 text-xs text-amber-300">Waiting for microphone permission…</p>
          )}

          {peers.length > 0 ? (
            <div className="mt-4 space-y-3">
              {peers.map((peer) => (
                <div key={peer.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${peer.state === 'connected' ? 'bg-emerald-400' : 'bg-neutral-600'}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{peer.username}</span>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white"
                      aria-label={peer.muted ? `Unmute ${peer.username}` : `Mute ${peer.username}`}
                      onClick={() => togglePeerMuted(peer.id)}
                    >
                      {peer.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      className="h-1.5 flex-1 cursor-pointer accent-sky-400"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(peer.volume * 100)}
                      aria-label={`${peer.username} volume`}
                      onChange={(event) => setPeerVolume(peer.id, Number(event.target.value) / 100)}
                    />
                    <span className="w-9 text-right font-mono text-[11px] text-neutral-400">
                      {Math.round(peer.volume * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-neutral-400">
              {room ? 'Waiting for another player to join voice.' : 'Voice will join when a party or match room is available.'}
            </p>
          )}

          {micMode === 'push_to_talk' && active && (
            <p className="mt-3 text-[11px] text-neutral-500">
              Uses the Counter-Strike +voicerecord key while you are in game.
            </p>
          )}
          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        </div>
      )}
    </aside>
  )
}
