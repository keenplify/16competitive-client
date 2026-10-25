import { createRoot } from 'react-dom/client'
import { PartyModelScene, type PartySceneActor } from '../src/renderer/src/features/party/PartyModelScene'
import type { PartyMember } from '../src/shared/party'
import dust from '../src/renderer/src/assets/dust.jpg'

const modelFiles = ['gign', 'leet', 'sas', 'guerilla', 'arctic'] as const
const weaponKeys = ['m4a1', 'deagle', 'ak47', 'awp', 'mp5navy'] as const
const weaponFiles = ['p_m4a1.mdl', 'p_deagle.mdl', 'p_ak47.mdl', 'p_awp.mdl', 'p_mp5.mdl'] as const

const readModel = async (path: string): Promise<ArrayBuffer> => {
  const lobbyMatch = /^lobby\/([a-z0-9_]+_lobby\.mdl)$/i.exec(path)
  const file = lobbyMatch
    ? `/resources/lobby-models/${lobbyMatch[1]}`
    : (weaponFiles as readonly string[]).includes(path)
      ? `/resources/web-models/${path}`
      : null
  if (!file) throw new Error(`Unsupported capture model: ${path}`)
  const response = await fetch(file)
  if (!response.ok) throw new Error(`Could not load capture model: ${file}`)
  return response.arrayBuffer()
}

Object.defineProperty(window, 'api', {
  value: {
    models: { read: readModel },
    skins: { previewModel: async () => { throw new Error('No skin preview in artwork capture') } },
    updater: { getCurrentVersion: async () => 'lobby-artwork-v1' }
  },
  configurable: true
})

const actors: PartySceneActor[] = modelFiles.map((model, index) => {
  const member: PartyMember = {
    id: `artwork-player-${index}`,
    username: `Player ${index + 1}`,
    mmr: 0,
    lobbyPlayerModel: `player/${model}/${model}.mdl`,
    lobbyWeaponSkinId: null,
    lobbyWeaponKey: weaponKeys[index],
    lobbyWeaponModelPath: null,
    clientMode: 'desktop'
  }
  return {
    member,
    modelPath: `lobby/${model}_lobby.mdl`,
    fallbackModelPath: `lobby/${model}_lobby.mdl`,
    weaponPath: weaponFiles[index],
    weaponSkinId: null,
    weaponKey: weaponKeys[index],
    isLeader: index === 2,
    isCurrentPlayer: false
  }
})

document.body.style.cssText = 'margin:0;background:#101716;overflow:hidden'

createRoot(document.getElementById('root')!).render(
  <main
    aria-label="Five Counter-Strike 1.6 players in the lobby"
    style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: `linear-gradient(90deg,rgba(8,15,17,.42),rgba(8,15,17,.08)),url(${dust}) center / cover`
    }}
  >
    <PartyModelScene actors={actors} showNameplates={false} className="lobby-artwork-scene" verticalOffset={-45} />
    <style>{`.lobby-artwork-scene { display:block; width:100%; height:100%; }`}</style>
  </main>
)
