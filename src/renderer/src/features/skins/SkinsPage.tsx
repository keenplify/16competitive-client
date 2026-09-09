import { Check, Crosshair, LoaderCircle, Palette, Power, PowerOff, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { OwnedSkin } from '../../../../shared/skins'
import { Button } from '../../components/ui/Button'
import { ModalPortal } from '../../components/ui/ModalPortal'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { useAuthStore } from '../auth/auth.store'
import { usePartyStore } from '../party/party.store'
import { useLobbyLoadoutStore } from '../party/lobby-loadout.store'
import { toast } from 'react-toastify'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { SkinCardPreview, SkinPreview } from './ShopPage'
import { SkinModelThumbnail } from './SkinModelThumbnail'
import { LOBBY_PLAYER_MODELS } from '../party/party-models'

type Team = 'ct' | 't'
type WeaponCategory = 'all' | 'pistols' | 'rifles' | 'smgs' | 'heavy' | 'snipers' | 'knives'
type LoadoutGroup = Exclude<WeaponCategory, 'all' | 'knives'>

const loadoutGroups: Record<Team, Record<LoadoutGroup, string[]>> = {
  ct: {
    pistols: ['usp', 'p228', 'deagle', 'fiveseven'],
    smgs: ['tmp', 'mp5navy', 'ump45', 'p90'],
    rifles: ['famas', 'm4a1', 'aug'],
    snipers: ['scout', 'awp', 'sg550'],
    heavy: ['m249']
  },
  t: {
    pistols: ['glock18', 'p228', 'deagle', 'elite'],
    smgs: ['mac10', 'mp5navy', 'ump45', 'p90'],
    rifles: ['galil', 'ak47', 'sg552'],
    snipers: ['scout', 'awp', 'g3sg1'],
    heavy: ['m249']
  }
}

const loadoutGroupLabels: Record<LoadoutGroup, string> = {
  pistols: 'Pistols',
  smgs: 'SMGs',
  rifles: 'Rifles',
  snipers: 'Snipers',
  heavy: 'Machine gun'
}
const loadoutGroupOrder: LoadoutGroup[] = ['pistols', 'smgs', 'rifles', 'snipers', 'heavy']

const weaponCategory = (key: string): WeaponCategory => {
  if (['glock18', 'usp', 'p228', 'deagle', 'elite', 'fiveseven'].includes(key)) return 'pistols'
  if (['galil', 'famas', 'ak47', 'm4a1', 'aug', 'sg552'].includes(key)) return 'rifles'
  if (['tmp', 'mac10', 'mp5navy', 'ump45', 'p90'].includes(key)) return 'smgs'
  if (['scout', 'awp', 'sg550', 'g3sg1'].includes(key)) return 'snipers'
  if (key === 'knife') return 'knives'
  return 'heavy'
}

const displayWeapon = (key: string): string =>
  key
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace('Ak47', 'AK-47')
    .replace('M4a1', 'M4A1')
    .replace('Usp', 'USP')
    .replace('Awp', 'AWP')
    .replace('Mp9', 'MP9')
    .replace('Mac10', 'MAC-10')
    .replace('Glock18', 'Glock 18')
    .replace('Mp5navy', 'MP5-N')
    .replace('Sg552', 'SG 552')
    .replace('Sg550', 'SG 550')
    .replace('G3sg1', 'G3/SG-1')
    .replace('M249', 'M249')

const defaultPlayerModelPath = (weaponKey: string): string =>
  `p_${weaponKey === 'mp5navy' ? 'mp5' : weaponKey}.mdl`

const categories: Array<{ id: WeaponCategory; label: string }> = [
  { id: 'all', label: 'All weapons' },
  { id: 'pistols', label: 'Pistols' },
  { id: 'smgs', label: 'SMGs' },
  { id: 'rifles', label: 'Rifles' },
  { id: 'snipers', label: 'Snipers' },
  { id: 'heavy', label: 'Machine gun' },
  { id: 'knives', label: 'Knife' }
]

const errorText = (reason: unknown): string =>
  reason instanceof Error ? reason.message : 'Could not update your loadout.'

export function SkinsPage(): JSX.Element {
  const [skins, setSkins] = useState<OwnedSkin[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [changingId, setChangingId] = useState<string | null>(null)
  const [previewSkin, setPreviewSkin] = useState<OwnedSkin['skin'] | null>(null)
  const [team, setTeam] = useState<Team>('ct')
  const [category, setCategory] = useState<WeaponCategory>('all')
  const [selectedWeapon, setSelectedWeapon] = useState<string | null>(null)
  const [unequippingTeam, setUnequippingTeam] = useState(false)
  const [lobbyWeaponId, setLobbyWeaponId] = useState<string | null>(null)
  const [lobbyPlayerModel, setLobbyPlayerModel] = useState<string | null>(null)
  const [changingLobbyPlayer, setChangingLobbyPlayer] = useState(false)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const playerId = useAuthStore((state) => state.session?.player.id)
  const party = usePartyStore((state) => state.party)
  const updateLobbyPlayerModel = useLobbyLoadoutStore((state) => state.setPlayerModel)
  const updateLobbyWeapon = useLobbyLoadoutStore((state) => state.setWeapon)
  const loadoutLocked = [
    'match_found',
    'ready_check',
    'countdown',
    'starting_server',
    'server_ready'
  ].includes(queueStatus)

  const refresh = (): void => {
    setStatus('loading')
    setError(null)
    const getLobbyLoadout = window.api.skins.getLobbyLoadout
    void Promise.all([
      window.api.skins.mine(),
      getLobbyLoadout?.() ??
        Promise.resolve({
          playerModel: 'player/gign/gign.mdl',
          weaponSkinId: null,
          weaponKey: 'ak47',
          weaponModelPath: null
        })
    ]).then(
      ([inventory, lobbyLoadout]) => {
        setSkins(inventory)
        setLobbyPlayerModel(lobbyLoadout.playerModel)
        setStatus('ready')
      },
      (reason: unknown) => {
        setError(errorText(reason))
        setStatus('error')
      }
    )
  }

  useEffect(() => {
    void Promise.resolve().then(refresh)
  }, [])

  const equippedByWeapon = useMemo(
    () =>
      new Map(
        skins.filter((owned) => owned.equippedAt).map((owned) => [owned.skin.weaponKey, owned])
      ),
    [skins]
  )
  const teamWeaponKeys = new Set([...Object.values(loadoutGroups[team]).flat(), 'knife'])
  const partyLobbyPlayerModel = party?.members.find(
    (candidate) => candidate.id === playerId
  )?.lobbyPlayerModel
  const selectedLobbyPlayerModel = lobbyPlayerModel ?? partyLobbyPlayerModel
  const filteredSkins = skins.filter(
    (owned) =>
      teamWeaponKeys.has(owned.skin.weaponKey) &&
      (category === 'all' || weaponCategory(owned.skin.weaponKey) === category) &&
      (!selectedWeapon || owned.skin.weaponKey === selectedWeapon)
  )
  const equippedForTeam = skins.filter(
    (owned) => owned.equippedAt && teamWeaponKeys.has(owned.skin.weaponKey)
  )

  const selectTeam = (nextTeam: Team): void => {
    setTeam(nextTeam)
    setCategory('all')
    setSelectedWeapon(null)
  }

  const selectLoadoutWeapon = (weaponKey: string): void => {
    setSelectedWeapon(weaponKey)
    setCategory('all')
  }

  const setLobbyWeapon = (owned: OwnedSkin): void => {
    if (loadoutLocked || lobbyWeaponId || owned.lobbySelected) return
    setLobbyWeaponId(owned.skin.id)
    setError(null)
    void window.api.skins
      .setLobbyWeapon(owned.skin.id)
      .then(() => Promise.all([window.api.skins.mine(), window.api.skins.getLobbyLoadout()]))
      .then(([inventory, lobbyLoadout]) => {
        setSkins(inventory)
        updateLobbyWeapon(lobbyLoadout.weaponKey, lobbyLoadout.weaponModelPath)
        toast.success(`${owned.skin.name} is now displayed in your lobby.`)
      })
      .catch((reason: unknown) => setError(errorText(reason)))
      .finally(() => setLobbyWeaponId(null))
  }

  const setDefaultLobbyWeapon = (weaponKey: string): void => {
    if (loadoutLocked || lobbyWeaponId) return
    setLobbyWeaponId(weaponKey)
    setError(null)
    void window.api.skins
      .setLobbyWeaponKey(weaponKey)
      .then(() => {
        updateLobbyWeapon(weaponKey, null)
        toast.success(`${displayWeapon(weaponKey)} is now displayed in your lobby.`)
      })
      .catch((reason: unknown) => setError(errorText(reason)))
      .finally(() => setLobbyWeaponId(null))
  }

  const setLobbyPlayer = (modelPath: string): void => {
    if (loadoutLocked || changingLobbyPlayer || selectedLobbyPlayerModel === modelPath) return
    setChangingLobbyPlayer(true)
    setError(null)
    void window.api.skins
      .setLobbyPlayerModel(modelPath)
      .then(() => {
        setLobbyPlayerModel(modelPath)
        updateLobbyPlayerModel(modelPath)
        toast.success(`${displayPlayerModel(modelPath)} is now your lobby character.`)
      })
      .catch((reason: unknown) => setError(errorText(reason)))
      .finally(() => setChangingLobbyPlayer(false))
  }

  const setEquipped = (owned: OwnedSkin): void => {
    if (loadoutLocked) return
    setChangingId(owned.skin.id)
    setError(null)
    const request = owned.equippedAt
      ? window.api.skins.unequip(owned.skin.id)
      : window.api.skins.equip(owned.skin.id)
    void request
      .then(() => window.api.skins.mine())
      .then((inventory) => {
        setSkins(inventory)
        setStatus('ready')
      })
      .catch((reason: unknown) => setError(errorText(reason)))
      .finally(() => setChangingId(null))
  }

  const unequipAllForTeam = (): void => {
    if (loadoutLocked || equippedForTeam.length === 0 || unequippingTeam) return
    setUnequippingTeam(true)
    setError(null)
    void Promise.all(equippedForTeam.map((owned) => window.api.skins.unequip(owned.skin.id)))
      .then(() => window.api.skins.mine())
      .then((inventory) => setSkins(inventory))
      .catch((reason: unknown) => setError(errorText(reason)))
      .finally(() => setUnequippingTeam(false))
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-72 items-center justify-center" role="status">
        <LoaderCircle className="size-7 animate-spin text-sky-300" />
      </div>
    )
  }

  if (status === 'error')
    return (
      <Button className="mt-6" variant="ghost" onClick={refresh}>
        Retry inventory
      </Button>
    )
  if (skins.length === 0) return <EmptyInventory />

  return (
    <section className="mt-6 flex min-h-[calc(100vh-15rem)] flex-col bg-[#080a0e]">
      {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}
      <section className="min-h-[26rem] flex-[3] border border-white/10 bg-[radial-gradient(circle_at_48%_0%,rgba(56,189,248,0.12),transparent_45%),linear-gradient(125deg,#111722,#080a0e)] p-4 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-sky-300 uppercase">
              Active loadout
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              {team === 'ct' ? 'Counter-Terrorists' : 'Terrorists'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="h-8 rounded-none bg-transparent px-2.5 text-[9px] text-rose-300 hover:bg-transparent hover:text-rose-200 disabled:bg-transparent"
              variant="ghost"
              disabled={loadoutLocked || unequippingTeam || equippedForTeam.length === 0}
              onClick={unequipAllForTeam}
            >
              <PowerOff className="mr-1 size-3" />
              {unequippingTeam ? 'UNEQUIPPING…' : 'UNEQUIP ALL'}
            </Button>
            <div
              className="flex border border-white/15 bg-black/25 p-1"
              role="tablist"
              aria-label="Loadout team"
            >
              {(['ct', 't'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={team === id}
                  disabled={loadoutLocked || unequippingTeam}
                  className={twMerge(
                    'px-4 py-2 text-xs font-bold tracking-wide',
                    team === id
                      ? id === 'ct'
                        ? 'bg-sky-400 text-slate-950'
                        : 'bg-amber-300 text-amber-950'
                      : 'text-neutral-400 hover:text-white'
                  )}
                  onClick={() => selectTeam(id)}
                >
                  EQUIP {id.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">
          <span className="mr-1 text-[10px] font-bold tracking-[0.16em] text-neutral-500 uppercase">
            Lobby character
          </span>
          {LOBBY_PLAYER_MODELS.map((modelPath) => {
            const selected = selectedLobbyPlayerModel === modelPath
            return (
              <Button
                key={modelPath}
                className="h-7 px-2 text-[10px]"
                variant={selected ? 'primary' : 'ghost'}
                disabled={loadoutLocked || changingLobbyPlayer}
                onClick={() => setLobbyPlayer(modelPath)}
              >
                {displayPlayerModel(modelPath)}
              </Button>
            )
          })}
        </div>
        <div className="mt-4 overflow-x-auto pb-2">
          <div className="grid min-w-[62rem] grid-cols-6 gap-2.5">
            {loadoutGroupOrder.map((group) => (
              <section key={group} className="flex h-full flex-col">
                <h3 className="mb-2 text-[10px] font-bold tracking-[0.16em] text-neutral-500 uppercase">
                  {loadoutGroupLabels[group]}
                </h3>
                <div className="space-y-1.5">
                  {loadoutGroups[team][group].map((weaponKey) => (
                    <LoadoutWeaponCard
                      key={weaponKey}
                      weaponKey={weaponKey}
                      equipped={equippedByWeapon.get(weaponKey)}
                      selected={selectedWeapon === weaponKey}
                      lobbyWeaponId={lobbyWeaponId}
                      loadoutLocked={loadoutLocked}
                      onSetLobbyWeapon={setLobbyWeapon}
                      onSetDefaultLobbyWeapon={setDefaultLobbyWeapon}
                      onSelect={() => selectLoadoutWeapon(weaponKey)}
                    />
                  ))}
                </div>
              </section>
            ))}
            <section>
              <h3 className="mb-2 text-[10px] font-bold tracking-[0.16em] text-neutral-500 uppercase">
                Knife
              </h3>
              <LoadoutWeaponCard
                weaponKey="knife"
                equipped={equippedByWeapon.get('knife')}
                selected={selectedWeapon === 'knife'}
                lobbyWeaponId={lobbyWeaponId}
                loadoutLocked={loadoutLocked}
                onSetLobbyWeapon={setLobbyWeapon}
                onSetDefaultLobbyWeapon={setDefaultLobbyWeapon}
                onSelect={() => selectLoadoutWeapon('knife')}
              />
            </section>
          </div>
        </div>
      </section>

      <section className="flex-[1] border-t border-white/10 bg-[#080a0e] p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" aria-label="Filter inventory by weapon type">
            {categories.map(({ id, label }) => (
              <Button
                key={id}
                className={twMerge(
                  'h-8 px-3 text-xs',
                  category === id && !selectedWeapon && 'ring-1 ring-sky-300'
                )}
                variant={category === id && !selectedWeapon ? 'primary' : 'ghost'}
                onClick={() => {
                  setCategory(id)
                  setSelectedWeapon(null)
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          {selectedWeapon && (
            <Button
              className="h-8 px-3 text-xs"
              variant="ghost"
              onClick={() => setSelectedWeapon(null)}
            >
              Showing: {displayWeapon(selectedWeapon)} ×
            </Button>
          )}
        </header>
        {filteredSkins.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            No unlocked skins for this weapon.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSkins.map((owned) => (
              <InventoryCard
                key={owned.skin.id}
                owned={owned}
                changing={loadoutLocked || unequippingTeam || changingId === owned.skin.id}
                onEquip={() => setEquipped(owned)}
                onPreview={() => setPreviewSkin(owned.skin)}
              />
            ))}
          </div>
        )}
      </section>
      {previewSkin && (
        <ModalPortal>
          <SkinPreview
            key={previewSkin.id}
            skin={previewSkin}
            onClose={() => setPreviewSkin(null)}
          />
        </ModalPortal>
      )}
    </section>
  )
}

function InventoryCard({
  owned,
  changing,
  onEquip,
  onPreview
}: {
  owned: OwnedSkin
  changing: boolean
  onEquip: () => void
  onPreview: () => void
}): JSX.Element {
  const equipped = owned.equippedAt !== null
  return (
    <article className="flex min-h-56 flex-col border border-white/10 bg-neutral-900/90 p-4">
      <SkinCardPreview skin={owned.skin} owned onOpen={onPreview} />
      <p className="text-[10px] font-bold tracking-[0.16em] text-sky-400 uppercase">
        {owned.skin.weaponKey}
      </p>
      <h3 className="mt-1 text-sm font-semibold">{owned.skin.name}</h3>
      <div className="mt-auto flex justify-end border-t border-white/10 pt-3">
        <Button
          className="h-8 min-w-28 px-3 text-xs"
          variant={equipped ? 'ghost' : 'primary'}
          disabled={changing}
          onClick={onEquip}
        >
          {changing ? (
            'Updating…'
          ) : equipped ? (
            <>
              <PowerOff className="mr-1 size-3.5" /> Unequip
            </>
          ) : (
            <>
              <Power className="mr-1 size-3.5" /> Equip
            </>
          )}
        </Button>
      </div>
    </article>
  )
}

function LoadoutWeaponCard({
  weaponKey,
  equipped,
  selected,
  lobbyWeaponId,
  loadoutLocked,
  onSetLobbyWeapon,
  onSetDefaultLobbyWeapon,
  onSelect
}: {
  weaponKey: string
  equipped: OwnedSkin | undefined
  selected: boolean
  lobbyWeaponId: string | null
  loadoutLocked: boolean
  onSetLobbyWeapon: (owned: OwnedSkin) => void
  onSetDefaultLobbyWeapon: (weaponKey: string) => void
  onSelect: () => void
}): JSX.Element {
  const lobbyButtonLabel = equipped?.lobbySelected
    ? 'Shown in your lobby'
    : 'Show this weapon in your lobby'
  return (
    <div
      className={twMerge(
        'group relative flex h-28 w-full flex-col border bg-black/35 p-1.5 text-left transition hover:border-sky-300/70 hover:bg-sky-400/10',
        selected ? 'border-sky-300 bg-sky-400/15 ring-1 ring-sky-300/50' : 'border-white/10'
      )}
    >
      <button type="button" className="min-h-0 flex-1" aria-pressed={selected} onClick={onSelect}>
        <LoadoutThumbnail
          key={equipped?.skin.id ?? weaponKey}
          weaponKey={weaponKey}
          equipped={equipped}
        />
      </button>
      {
        <button
          type="button"
          className="absolute right-2 bottom-8 flex size-6 items-center justify-center rounded-full border border-white/20 bg-neutral-950/90 text-sky-200 shadow transition hover:bg-sky-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          title={equipped ? lobbyButtonLabel : 'Show this weapon in your lobby'}
          aria-label={equipped ? lobbyButtonLabel : 'Show this weapon in your lobby'}
          disabled={loadoutLocked || lobbyWeaponId !== null || equipped?.lobbySelected}
          onClick={() =>
            equipped ? onSetLobbyWeapon(equipped) : onSetDefaultLobbyWeapon(weaponKey)
          }
        >
          {equipped?.lobbySelected ? <Check className="size-3.5" /> : <Users className="size-3.5" />}
        </button>
      }
      <span className="block w-full min-w-0 px-1 py-1.5">
        <span className="block truncate text-center text-xs font-bold tracking-wide text-neutral-300">
          {equipped?.skin.name ?? displayWeapon(weaponKey)}
        </span>
      </span>
    </div>
  )
}

function LoadoutThumbnail({
  weaponKey,
  equipped
}: {
  weaponKey: string
  equipped: OwnedSkin | undefined
}): JSX.Element {
  const skinId = equipped?.skin.id
  const installationPath = useGameSettingsStore((state) => state.savedPath)
  const cacheKey = skinId
    ? `skin-loadout:v3:${skinId}`
    : `default-loadout:v3:${installationPath ?? 'auto'}:${weaponKey}`

  return (
    <span className="relative flex h-20 w-full shrink-0 items-center justify-center overflow-hidden bg-slate-950/75">
      <SkinModelThumbnail
        key={cacheKey}
        cacheKey={cacheKey}
        skinId={skinId}
        modelPath={skinId ? undefined : defaultPlayerModelPath(weaponKey)}
        sourceRevision={installationPath ?? 'unloaded'}
        modelKey={skinId ? `loadout-${skinId}` : undefined}
        weaponKey={weaponKey}
        fallback={
          <Crosshair
            className={skinId ? 'size-5 text-sky-300/70' : 'size-5 text-neutral-600'}
            aria-hidden="true"
          />
        }
        className="pointer-events-none absolute inset-0"
      />
    </span>
  )
}

function EmptyInventory(): JSX.Element {
  return (
    <div className="mt-6 border border-dashed border-white/15 bg-black/20 p-10 text-center">
      <Palette className="mx-auto size-7 text-neutral-500" aria-hidden="true" />
      <p className="mt-3 font-medium">No skins unlocked yet.</p>
      <p className="mt-1 text-sm text-neutral-400">
        Visit the Store to unlock a skin for your loadout.
      </p>
    </div>
  )
}

function displayPlayerModel(modelPath: string): string {
  const model = modelPath.split('/').at(-2) ?? 'Character'
  return model.replace(
    /(^|_)([a-z])/g,
    (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`
  )
}
