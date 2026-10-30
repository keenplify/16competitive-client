// Development fixture: no network purchases or real accounts.
import { createRoot } from 'react-dom/client'
import { CollectionPage } from '../src/renderer/src/features/skins/CollectionPage'
import { LobbyNewsPanel } from '../src/renderer/src/features/news/LobbyNewsPanel'
import { useCollectionsStore } from '../src/renderer/src/features/skins/collections.store'
import { useNavigationStore } from '../src/renderer/src/features/navigation/navigation.store'
import { useAuthStore } from '../src/renderer/src/features/auth/auth.store'
import type { CollectionDetail, CollectionBuyInput } from '../src/shared/skin-collections'
import type { Skin } from '../src/shared/skins'
import dust from '../src/renderer/src/assets/dust.jpg'
import '../src/renderer/src/assets/main.css'
const mode = new URLSearchParams(location.search).get('view') ?? 'rail'
const collection = {
  id: 'halloween',
  name: 'Halloween Collection · preview',
  description: 'Four finishes for the season. Choose your favorites or complete the package.',
  imageUrl: location.origin + dust,
  videoUrl: null,
  published: true,
  featured: true,
  discountPercent: 20,
  skinIds: ['11111111-1111-4111-8111-111111111111']
}
const items = ['Nightfall', 'Lantern', 'Specter', 'Last Light'].map((name, i) => ({
  id: `${i + 1}1111111-1111-4111-8111-111111111111`,
  gameVersion: 'cs16',
  status: 'ACTIVE',
  weaponKey: ['ak47', 'm4a1', 'awp', 'knife'][i],
  name,
  description: 'Collection preview item.',
  pricePoints: 1000,
  pointsEnabled: true,
  pricePCash: 250,
  viewerPCash: 5000,
  availableFrom: null,
  availableUntil: null,
  creatorName: 'Preview',
  creatorUrl: null,
  sourceUrl: 'https://example.test/source',
  licenseName: 'Original',
  licenseUrl: null,
  attributionText: '',
  viewModelPath: null,
  playerModelPath: null,
  worldModelPath: null,
  actionSoundPath: null,
  explosionSpritePath: null,
  owned: i === 0
})) as (Skin & { owned: boolean })[]
collection.skinIds = items.map((i) => i.id)
const detail: CollectionDetail = { collection, items }
const keys: string[] = []
const settled = new Map()
let uncertain = true
Object.assign(window, { collectionFixture: { keys, settled } })
window.api = {
  models: { readThumbnail: async () => null, writeThumbnail: async () => {} },
  skins: {
    collections: async () => (mode === 'news' ? [] : [collection]),
    collection: async () => structuredClone(detail),
    collectionQuote: async (_id: string, currency: 'POINTS' | 'P_CASH') => ({
      collectionId: collection.id,
      currency,
      discountPercent: 20,
      subtotal: currency === 'POINTS' ? 3000 : 750,
      total: currency === 'POINTS' ? 2400 : 600,
      items: items
        .filter((i) => !i.owned)
        .map((i) => ({ skinId: i.id, price: currency === 'POINTS' ? 800 : 200 })),
      quoteHash: 'a'.repeat(64)
    }),
    collectionBuy: async (id: string, input: CollectionBuyInput) => {
      keys.push(input.requestKey)
      if (!settled.has(input.requestKey))
        settled.set(input.requestKey, {
          points: 10000,
          pCash: 4400,
          receipt: {
            requestKey: input.requestKey,
            collectionId: id,
            currency: input.currency,
            total: 600
          }
        })
      if (uncertain) {
        uncertain = false
        throw new Error('Connection lost after settlement')
      }
      return settled.get(input.requestKey)
    },
    previewModel: async () => {
      throw new Error('No model in visual fixture')
    }
  },
  news: {
    getPreview: async () => [
      {
        id: 'news',
        content: 'Ordinary news preview',
        url: 'https://example.test/news',
        mediaUrl: null,
        createdAt: '2026-10-31T00:00:00Z'
      }
    ]
  },
  operations: {
    getMine: async () => ({
      operation:
        mode === 'package-only'
          ? null
          : { id: 'op', title: 'First Wave', bannerUrl: location.origin + dust, tiers: [] },
      progress: null
    })
  }
} as unknown as typeof window.api
useAuthStore.setState({
  session: {
    expiresAt: '2099-01-01T00:00:00Z',
    player: {
      id: 'preview',
      username: 'Preview',
      email: null,
      mmr: 1000,
      points: 10000,
      flagCountryCode: null,
      createdAt: '2026-01-01T00:00:00Z',
      hasPassword: true,
      requiresUsernameSetup: false,
      usernameChangeAvailableAt: null
    }
  }
})
if (mode === 'page') void useCollectionsStore.getState().open(collection.id)
export function Preview() {
  const page = useNavigationStore((state) => state.page)
  return mode === 'page' || page === 'store' ? (
    <CollectionPage />
  ) : (
    <main className="min-h-screen bg-cover" style={{ backgroundImage: `url(${dust})` }}>
      <LobbyNewsPanel className="h-screen" />
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Preview />)
