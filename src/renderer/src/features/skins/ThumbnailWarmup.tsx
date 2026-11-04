import { useEffect, useState } from 'react'
import { skinPreviewRevision } from '../../../../shared/skins'
import { useAuthStore } from '../auth/auth.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { SkinModelThumbnail } from './SkinModelThumbnail'
import { useThumbnailWarmupStore } from './thumbnail-warmup.store'

/** Fill the persistent store-card cache one item at a time before Store is opened. */
export function ThumbnailWarmup(): React.JSX.Element | null {
  const owner = useAuthStore((state) => state.session?.player.id ?? null)
  const page = useNavigationStore((state) => state.page)
  const playing = useMatchmakingStore((state) => state.queueStatus !== 'idle' || !!state.match)
  const { skins, index, load, advance } = useThumbnailWarmupStore()
  const [ready, setReady] = useState<{ owner: string; index: number } | null>(null)
  const paused = !owner || playing || page === 'store' || page === 'profile'
  useEffect(() => {
    void load(owner)
  }, [load, owner])
  useEffect(() => {
    // Yield between synchronous model decodes; never compete with an open store or match.
    if (paused || !owner) return
    const idle = window.requestIdleCallback(() => setReady({ owner, index }), { timeout: 2000 })
    return () => window.cancelIdleCallback(idle)
  }, [paused, index, owner])
  const skin = skins[index]
  if (paused || ready?.owner !== owner || ready.index !== index || !skin) return null
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed -left-[1024px] top-0 h-64 w-[512px] overflow-hidden opacity-0"
    >
      <SkinModelThumbnail
        key={skin.id}
        cacheKey={`skin-card:v3:${skin.id}`}
        skinId={skin.id}
        sourceRevision={skinPreviewRevision(skin)}
        weaponKey={skin.weaponKey}
        previewHiddenTextures={skin.previewHiddenTextures}
        previewRotation={skin.previewRotation}
        fallback={null}
        onSettled={advance}
      />
    </div>
  )
}
