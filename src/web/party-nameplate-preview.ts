import dustBackground from '../renderer/src/assets/dust.jpg'
import {
  createNameplate,
  type PartySceneActor
} from '../renderer/src/features/party/PartyModelScene'
import { ProfileRankInsignia } from '../renderer/src/components/ui/ProfileRankInsignia'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { profileRankTitle, profileXpForNextLevel } from '../shared/profile-ranks'

const actor: PartySceneActor = {
  member: {
    id: 'preview-player',
    username: 'keenplify',
    mmr: 1000,
    level: 28,
    levelTitle: profileRankTitle(28),
    xpIntoLevel: 2_050,
    xpForNextLevel: profileXpForNextLevel(28),
    lobbyPlayerModel: null,
    lobbyWeaponSkinId: null,
    lobbyWeaponKey: 'ak47',
    lobbyWeaponModelPath: null,
    clientMode: 'desktop'
  },
  modelPath: '',
  fallbackModelPath: '',
  weaponPath: '',
  weaponSkinId: null,
  weaponKey: 'ak47',
  isLeader: true,
  isCurrentPlayer: true
}

const sprite = createNameplate(actor)
const canvas = (sprite.material as unknown as { map: { image: HTMLCanvasElement } }).map.image
const preview = document.getElementById('preview')!
document.body.style.background = `#0c1016 url("${dustBackground}") center top / 100% auto no-repeat`
canvas.style.width = '100%'
canvas.style.height = 'auto'
preview.append(canvas)

const gallery = document.getElementById('insignias')!
for (let level = 1; level <= 40; level += 1) {
  const title = profileRankTitle(level)
  const card = document.createElement('article')
  card.className = 'insignia-card'
  card.innerHTML = `${renderToStaticMarkup(createElement(ProfileRankInsignia, { level, title }))}<span>Level ${level}</span><strong>${title}</strong>`
  gallery.append(card)
}
