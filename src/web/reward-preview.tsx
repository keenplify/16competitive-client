import { launcherAudio } from '../renderer/src/features/audio/audio.manager'
import weaponPreview from '../../resources/weapon-previews/p_ak47.png'
import stickerPreview from '../../scripts/fixtures/reward-sticker.png'
import { useLauncherThemeStore } from '../renderer/src/features/settings/launcher-theme.store'
// Local design review only; not referenced by the production entry point.
import './browser-api'
import '../renderer/src/assets/main.css'
import { createRoot } from 'react-dom/client'
import { useState, type JSX } from 'react'
import { RewardReveal } from '../renderer/src/features/rewards/RewardReveal'
import type { RewardReceipt } from '../shared/reward-inbox'

const receipt = (
  id: number,
  type: RewardReceipt['type'],
  amount: number,
  name: string | null = null
): RewardReceipt => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  type,
  amount,
  itemId: type,
  name,
  weaponKey: null,
  imagePath: null
})
if (import.meta.env.DEV) {
  launcherAudio.setBgmVolume(0)
  window.addEventListener('pointerdown', () => launcherAudio.unlockPlayback(), { once: true })
  if (new URLSearchParams(location.search).get('theme') === 'vgui2')
    useLauncherThemeStore.getState().setTheme('vgui2')
  else useLauncherThemeStore.getState().setTheme('latest')
  window.api.models.readThumbnail = async () => (await fetch(weaponPreview)).arrayBuffer()
  window.api.skins.stickerImage = async () => (await fetch(stickerPreview)).arrayBuffer()
}
export function Preview(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [multiple, setMultiple] = useState(new URLSearchParams(location.search).has('items'))
  const [busy, setBusy] = useState(false)
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'radial-gradient(ellipse at 70% 50%, #333b39, #11171b 65%)',
        color: 'white',
        padding: 40
      }}
    >
      <nav style={{ display: 'flex', gap: 30, opacity: 0.5, fontSize: 13 }}>
        <b>1.6 COMPETITIVE</b>
        <span>LOBBY</span>
        <span>PLAY</span>
        <span>INVENTORY</span>
      </nav>
      <div style={{ marginTop: 60 }}>
        <button onClick={() => setOpen(true)}>Replay animation</button>
        <button
          style={{ marginLeft: 30 }}
          onClick={() => {
            setMultiple(!multiple)
            setOpen(true)
          }}
        >
          Switch prize set
        </button>
      </div>
      {open && (
        <RewardReveal
          receipts={[
            receipt(1, 'POINTS', 150),
            receipt(2, 'POINTS', 80),
            ...(multiple
              ? [
                  receipt(3, 'P_CASH', 100),
                  {
                    ...receipt(4, 'SKIN', 1, 'AK-47'),
                    itemId: '11111111-1111-4111-8111-111111111111',
                    weaponKey: 'ak47',
                    pricePoints: 10000,
                    pointsEnabled: true
                  },
                  {
                    ...receipt(5, 'STICKER', 3, 'Sticker reward'),
                    itemId: 'water',
                    imagePath: `media/16competitive/stickers/${'a'.repeat(64)}/image.png`
                  }
                ]
              : [])
          ]}
          busy={busy}
          onContinue={() => {
            setBusy(true)
            setTimeout(() => {
              setBusy(false)
              setOpen(false)
            }, 600)
          }}
        />
      )}
    </div>
  )
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
