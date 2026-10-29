import { createRoot } from 'react-dom/client'
import '../src/renderer/src/assets/main.css'
import { SkinsPage } from '../src/renderer/src/features/skins/SkinsPage'
const params = new URLSearchParams(location.search)
document.documentElement.dataset.launcherTheme = params.get('theme') ?? 'latest'
let partyCharacter = 'player/gign/gign.mdl'
const demoInventory = ['m4a1', 'ak47', 'awp', 'deagle'].map((weaponKey, index) => ({
  skin: {
    id: `demo-${weaponKey}`,
    gameVersion: 'cs16',
    status: 'ACTIVE',
    weaponKey,
    name: `${weaponKey.toUpperCase()} · Classic`,
    description: 'Demo weapon',
    pricePoints: 0,
    pointsEnabled: true,
    pricePCash: null,
    viewerPCash: 0,
    availableFrom: null,
    availableUntil: null,
    creatorName: 'Demo',
    creatorUrl: null,
    sourceUrl: 'https://example.com',
    licenseName: 'Demo',
    licenseUrl: null,
    attributionText: '',
    viewModelPath: null,
    playerModelPath: `p_${weaponKey}.mdl`,
    worldModelPath: null,
    actionSoundPath: null,
    explosionSpritePath: null
  },
  reviewOnly: true,
  acquiredAt: new Date().toISOString(),
  acquiredForPoints: 0,
  equippedAt: index < 2 ? new Date().toISOString() : null,
  lobbySelected: false
}))
let ctCharacter = 'gign',
  tCharacter = 'terror'
window.api = new Proxy(
  {},
  {
    get: (_, area) =>
      new Proxy(
        {},
        {
          get: (_, method) => {
            if (area === 'models' && method === 'read')
              return async (path: string) => {
                const response = await fetch(
                  (path.startsWith('lobby/')
                    ? '/resources/lobby-models/'
                    : '/resources/web-models/') + path.split('/').pop()
                )
                return response.arrayBuffer()
              }
            if (area === 'skins' && method === 'mine') return async () => [...demoInventory]
            if (area === 'skins' && method === 'previewModel')
              return async (id: string) =>
                (
                  await fetch(`/resources/web-models/p_${id.replace('demo-', '')}.mdl`)
                ).arrayBuffer()
            if (area === 'skins' && (method === 'equip' || method === 'unequip'))
              return async (id: string) => {
                const item = demoInventory.find((item) => item.skin.id === id)
                if (item) item.equippedAt = method === 'equip' ? new Date().toISOString() : null
              }
            if (area === 'skins' && method === 'setLobbyPlayerModel')
              return async (path: string) => {
                partyCharacter = path
              }
            if (area === 'models' && method === 'readThumbnail') return async () => null
            if (area === 'skins' && method === 'getLobbyLoadout')
              return async () => ({
                ctCharacter,
                tCharacter,
                playerModel: partyCharacter,
                weaponKey: 'ak47',
                weaponSkinId: null,
                weaponModelPath: null
              })
            if (area === 'skins' && method === 'setCharacter')
              return async (team: string, model: string) => {
                await new Promise((resolve) => setTimeout(resolve, 600))
                if (params.has('error')) throw new Error('Fixture error')
                if (team === 'ct') ctCharacter = model
                else tCharacter = model
              }
            if (String(method).startsWith('on')) return () => () => {}
            return async () => []
          }
        }
      )
  }
) as typeof window.api
createRoot(document.getElementById('root')!).render(
  <main
    style={{
      width: params.has('narrow') ? 600 : 1700,
      maxWidth: '100%',
      margin: 'auto',
      color: 'white',
      padding: 16
    }}
  >
    <nav style={{ display: 'flex', gap: 20, padding: '12px 0', fontSize: 14 }}>
      <strong>Loadout demo · Sample data</strong>
      <a href="?theme=vgui2">VGUI2</a>
      <a href="?theme=latest">Latest</a>
    </nav>
    <SkinsPage />
  </main>
)
