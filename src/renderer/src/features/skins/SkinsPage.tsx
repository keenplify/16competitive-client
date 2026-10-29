import { STOCK_CHARACTERS } from '../../../../shared/skins'
import { CharacterPanel } from './CharacterPanel'
import { useCharacterLoadoutStore } from './character-loadout.store'
import { useTranslation } from '../i18n/i18n'
import { Check, Crosshair, LoaderCircle, Power, PowerOff, Users } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import type { OwnedSkin, SkinResaleQuote } from '../../../../shared/skins'
import { Button } from '../../components/ui/Button'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'
import { useAuthStore } from '../auth/auth.store'
import { useLobbyLoadoutStore } from '../party/lobby-loadout.store'
import { toast } from 'react-toastify'
import { useGameSettingsStore } from '../settings/game-settings.store'
import { SkinCardPreview, SkinPreview } from './ShopPage'
import { SkinModelThumbnail } from './SkinModelThumbnail'
import { skinPreviewRevision } from '../../../../shared/skins'
import { SellConfirmModal } from './SellConfirmModal'
import {
  GRENADE_WEAPON_KEYS,
  KNIFE_WEAPON_KEY,
  WEAPON_CATEGORIES,
  weaponCategory,
  weaponCategoryLabel,
  type WeaponCategory
} from './weapon-categories'
import { isWebRuntime } from '../../web-runtime'
import { useHideDesktopOnlyFeatures } from '../community/links'

type Team = 'ct' | 't'
type LoadoutGroup = Exclude<
  WeaponCategory,
  'all' | 'grenades' | 'knives' | 'player_ct' | 'player_t'
>

const loadoutGroups: Record<Team, Record<LoadoutGroup, string[]>> = {
  ct: {
    pistols: ['usp', 'p228', 'deagle', 'fiveseven'],
    shotguns: ['m3', 'xm1014'],
    smgs: ['tmp', 'mp5navy', 'ump45', 'p90'],
    rifles: ['famas', 'm4a1', 'aug'],
    snipers: ['scout', 'awp', 'sg550'],
    heavy: ['m249']
  },
  t: {
    pistols: ['glock18', 'p228', 'deagle', 'elite'],
    shotguns: ['m3', 'xm1014'],
    smgs: ['mac10', 'mp5navy', 'ump45', 'p90'],
    rifles: ['galil', 'ak47', 'sg552'],
    snipers: ['scout', 'awp', 'g3sg1'],
    heavy: ['m249']
  }
}

const loadoutGroupOrder: LoadoutGroup[] = [
  'pistols',
  'shotguns',
  'smgs',
  'rifles',
  'snipers',
  'heavy'
]

const loadoutGroupLabels: Record<LoadoutGroup, string> = {
  pistols: weaponCategoryLabel('pistols'),
  shotguns: weaponCategoryLabel('shotguns'),
  smgs: weaponCategoryLabel('smgs'),
  rifles: weaponCategoryLabel('rifles'),
  snipers: weaponCategoryLabel('snipers'),
  heavy: weaponCategoryLabel('heavy')
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
    .replace('Hegrenade', 'HE Grenade')
    .replace('Smokegrenade', 'Smoke Grenade')

const defaultPlayerModelPath = (weaponKey: string): string =>
  `p_${weaponKey === 'mp5navy' ? 'mp5' : weaponKey}.mdl`

const errorText = (reason: unknown): string =>
  reason instanceof Error ? reason.message : 'Could not update your loadout.'

export function SkinsPage(): JSX.Element {
  const webMode = isWebRuntime()
  const hideDesktopOnlyFeatures = useHideDesktopOnlyFeatures()
  const [skins, setSkins] = useState<OwnedSkin[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [changingId, setChangingId] = useState<string | null>(null)
  const [previewSkin, setPreviewSkin] = useState<OwnedSkin['skin'] | null>(null)
  const [sale, setSale] = useState<{ owned: OwnedSkin; quote: SkinResaleQuote } | null>(null)
  const [quotingId, setQuotingId] = useState<string | null>(null)
  const [selling, setSelling] = useState(false)
  const { t } = useTranslation()
  const team = useCharacterLoadoutStore((state) => state.team)
  const setTeam = useCharacterLoadoutStore((state) => state.selectTeam)
  const stockCharacters = useCharacterLoadoutStore((state) => state.stock)
  const partyModel = useLobbyLoadoutStore((state) => state.playerModel)
  const partyPending = useCharacterLoadoutStore((state) => state.partyPending)
  const showCharacterInParty = (side: Team): void => {
    const custom = equippedByWeapon.get(`player_${side}`)?.skin
    const path = custom
      ? `skin:${custom.id}`
      : `player/${stockCharacters[side]}/${stockCharacters[side]}.mdl`
    void useCharacterLoadoutStore
      .getState()
      .showInParty(path)
      .then(() => toast.success(t('character.partyChanged')))
      .catch(() => toast.error(t('character.error')))
  }
  const characterPending = useCharacterLoadoutStore((state) => state.pending)
  const [category, setCategory] = useState<WeaponCategory>('all')
  const [selectedWeapon, setSelectedWeapon] = useState<string | null>(null)
  const [unequippingTeam, setUnequippingTeam] = useState(false)
  const [lobbyWeaponId, setLobbyWeaponId] = useState<string | null>(null)
  const [lobbyWeaponKey, setLobbyWeaponKey] = useState<string | null>(null)
  const [lobbyWeaponSkinId, setLobbyWeaponSkinId] = useState<string | null>(null)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const playerId = useAuthStore((state) => state.session?.player.id)
  const updateLobbyWeapon = useLobbyLoadoutStore((state) => state.setWeapon)
  const loadoutLocked = [
    'match_found',
    'ready_check',
    'countdown',
    'starting_server',
    'server_ready'
  ].includes(queueStatus)

  const refresh = (showLoading = true): void => {
    if (showLoading) setStatus('loading')
    const getLobbyLoadout = window.api.skins.getLobbyLoadout
    void Promise.all([
      window.api.skins.mine(),
      getLobbyLoadout?.() ??
        Promise.resolve({
          ctCharacter: 'gign',
          tCharacter: 'terror',
          playerModel: 'player/gign/gign.mdl',
          weaponSkinId: null,
          weaponKey: 'ak47',
          weaponModelPath: null
        })
    ]).then(
      ([inventory, lobbyLoadout]) => {
        useCharacterLoadoutStore
          .getState()
          .setStock(lobbyLoadout.ctCharacter, lobbyLoadout.tCharacter)
        setSkins(inventory)
        setLobbyWeaponKey(lobbyLoadout.weaponKey)
        setLobbyWeaponSkinId(lobbyLoadout.weaponSkinId)
        updateLobbyWeapon(
          lobbyLoadout.weaponKey,
          lobbyLoadout.weaponModelPath,
          lobbyLoadout.weaponSkinId
        )
        setStatus('ready')
      },
      (reason: unknown) => {
        toast.error(errorText(reason))
        if (showLoading) setStatus('error')
      }
    )
  }

  useEffect(() => {
    void Promise.resolve().then(() => refresh())
    const onFocus = (): void => refresh(false)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId])

  const equippedByWeapon = new Map(
    skins.filter((owned) => owned.equippedAt).map((owned) => [owned.skin.weaponKey, owned])
  )
  const teamWeaponKeys = new Set([
    ...Object.values(loadoutGroups[team]).flat(),
    ...GRENADE_WEAPON_KEYS,
    KNIFE_WEAPON_KEY
  ])
  const filteredSkins = skins
    .filter(
      (owned) =>
        (category === 'player_ct' || category === 'player_t'
          ? true
          : teamWeaponKeys.has(owned.skin.weaponKey) ||
            owned.skin.weaponKey === `player_${team}`) &&
        (category === 'all' || weaponCategory(owned.skin.weaponKey) === category) &&
        (!selectedWeapon || owned.skin.weaponKey === selectedWeapon)
    )
    .sort((a, b) => Number(!!b.equippedAt) - Number(!!a.equippedAt))
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
    if (webMode || loadoutLocked || lobbyWeaponId || lobbyWeaponSkinId === owned.skin.id) return
    setLobbyWeaponId(owned.skin.id)
    void window.api.skins
      .setLobbyWeapon(owned.skin.id)
      .then(() => Promise.all([window.api.skins.mine(), window.api.skins.getLobbyLoadout()]))
      .then(([inventory, lobbyLoadout]) => {
        setSkins(inventory)
        setLobbyWeaponKey(lobbyLoadout.weaponKey)
        setLobbyWeaponSkinId(lobbyLoadout.weaponSkinId)
        updateLobbyWeapon(
          lobbyLoadout.weaponKey,
          lobbyLoadout.weaponModelPath,
          lobbyLoadout.weaponSkinId
        )
        toast.success(t('character.partyWeaponChanged'))
      })
      .catch((reason: unknown) => toast.error(errorText(reason)))
      .finally(() => setLobbyWeaponId(null))
  }

  const setDefaultLobbyWeapon = (weaponKey: string): void => {
    if (webMode || loadoutLocked || lobbyWeaponId) return
    setLobbyWeaponId(weaponKey)
    void window.api.skins
      .setLobbyWeaponKey(weaponKey)
      .then(() => {
        setLobbyWeaponKey(weaponKey)
        setLobbyWeaponSkinId(null)
        updateLobbyWeapon(weaponKey, null, null)
        toast.success(t('character.partyWeaponChanged'))
      })
      .catch((reason: unknown) => toast.error(errorText(reason)))
      .finally(() => setLobbyWeaponId(null))
  }

  const setEquipped = (owned: OwnedSkin): void => {
    if (loadoutLocked) return
    setChangingId(owned.skin.id)
    const request = owned.equippedAt
      ? window.api.skins.unequip(owned.skin.id)
      : window.api.skins.equip(owned.skin.id)
    void request
      .then(() => window.api.skins.mine())
      .then((inventory) => {
        setSkins(inventory)
        setStatus('ready')
      })
      .catch((reason: unknown) => toast.error(errorText(reason)))
      .finally(() => setChangingId(null))
  }

  const unequipAllForTeam = (): void => {
    if (loadoutLocked || equippedForTeam.length === 0 || unequippingTeam) return
    setUnequippingTeam(true)
    void Promise.all(equippedForTeam.map((owned) => window.api.skins.unequip(owned.skin.id)))
      .then(() => window.api.skins.mine())
      .then((inventory) => setSkins(inventory))
      .catch((reason: unknown) => toast.error(errorText(reason)))
      .finally(() => setUnequippingTeam(false))
  }

  const requestSale = (owned: OwnedSkin): void => {
    if (loadoutLocked || quotingId || selling) return
    setQuotingId(owned.skin.id)
    void window.api.skins
      .resaleQuote(owned.skin.id)
      .then((quote) => setSale({ owned, quote }))
      .catch((reason: unknown) => toast.error(errorText(reason)))
      .finally(() => setQuotingId(null))
  }

  const confirmSale = (): void => {
    if (!sale || selling) return
    setSelling(true)
    const { owned, quote } = sale
    void window.api.skins
      .sell(owned.skin.id, quote)
      .then((result) => {
        setSkins((current) => current.filter((item) => item.skin.id !== owned.skin.id))
        setSale(null)
        if (result.currency === 'POINTS') useAuthStore.getState().setPoints(result.balance)
        toast.success(
          `${owned.skin.name} sold for ${result.payout.toLocaleString()} ${result.currency === 'POINTS' ? 'Points' : 'Papa Cash'}.`
        )
        void Promise.all([window.api.skins.mine(), window.api.skins.getLobbyLoadout()])
          .then(([inventory, lobbyLoadout]) => {
            setSkins(inventory)
            setLobbyWeaponKey(lobbyLoadout.weaponKey)
            setLobbyWeaponSkinId(lobbyLoadout.weaponSkinId)
            updateLobbyWeapon(
              lobbyLoadout.weaponKey,
              lobbyLoadout.weaponModelPath,
              lobbyLoadout.weaponSkinId
            )
          })
          .catch((reason: unknown) => toast.error(errorText(reason)))
      })
      .catch((reason: unknown) => toast.error(errorText(reason)))
      .finally(() => setSelling(false))
  }

  const renderLoadoutCard = (weaponKey: string): JSX.Element => {
    const equipped = equippedByWeapon.get(weaponKey)
    const lobbySelected =
      lobbyWeaponKey === weaponKey &&
      (equipped ? lobbyWeaponSkinId === equipped.skin.id : lobbyWeaponSkinId === null)
    return (
      <LoadoutWeaponCard
        key={weaponKey}
        weaponKey={weaponKey}
        equipped={equipped}
        selected={selectedWeapon === weaponKey}
        lobbySelected={lobbySelected}
        lobbyWeaponId={lobbyWeaponId}
        loadoutLocked={loadoutLocked}
        canChangeLobbyWeapon={!webMode}
        onSetLobbyWeapon={setLobbyWeapon}
        onSetDefaultLobbyWeapon={setDefaultLobbyWeapon}
        onSelect={() => selectLoadoutWeapon(weaponKey)}
      />
    )
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
      <Button className="mt-6" variant="ghost" onClick={() => refresh()}>
        Retry inventory
      </Button>
    )
  return (
    <section className="loadout-page mt-6 flex min-h-[calc(100vh-15rem)] flex-col bg-[#080a0e]">
      <section className="loadout-equipped min-h-[26rem] flex-[3] border border-white/10 bg-[radial-gradient(circle_at_48%_0%,rgba(56,189,248,0.12),transparent_45%),linear-gradient(125deg,#111722,#080a0e)] p-4 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-sky-300 uppercase">
              Active loadout
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              {team === 'ct' ? 'Counter-Terrorists' : 'Terrorists'}
            </h2>
            {webMode && !hideDesktopOnlyFeatures && (
              <p className="mt-1 text-xs text-neutral-400">
                Lobby weapon selection is only available in the desktop app.
              </p>
            )}
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
                        ? 'bg-sky-400 text-sky-950'
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
        <div className="loadout-stage mt-4 grid grid-cols-[minmax(90px,0.8fr)_minmax(0,4fr)_minmax(90px,0.8fr)] items-stretch gap-2 lg:gap-4">
          <CharacterPanel
            team="ct"
            partyPending={partyPending}
            partySelected={
              partyModel ===
              (equippedByWeapon.get('player_ct')
                ? `skin:${equippedByWeapon.get('player_ct')!.skin.id}`
                : `player/${stockCharacters.ct}/${stockCharacters.ct}.mdl`)
            }
            onShowInParty={() => showCharacterInParty('ct')}
            model={stockCharacters.ct}
            skin={equippedByWeapon.get('player_ct')?.skin}
            selected={team === 'ct'}
            disabled={loadoutLocked}
            onSelect={() => selectTeam('ct')}
            className="order-1"
          />
          <div className="order-2 min-w-0">
            {' '}
            <div className="loadout-center min-w-0">
              <div className="loadout-groups grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
                {loadoutGroupOrder.map((group) => (
                  <section key={group} className="loadout-group flex h-full flex-col">
                    <h3 className="mb-2 text-[10px] font-bold tracking-[0.16em] text-neutral-500 uppercase">
                      {loadoutGroupLabels[group]}
                    </h3>
                    <div className="space-y-1.5">
                      {loadoutGroups[team][group].map((weaponKey) => renderLoadoutCard(weaponKey))}
                    </div>
                  </section>
                ))}
                <section className="loadout-group flex h-full flex-col">
                  <h3 className="mb-2 text-[10px] font-bold tracking-[0.16em] text-neutral-500 uppercase">
                    {weaponCategoryLabel('grenades')}
                  </h3>
                  <div className="space-y-1.5">
                    {GRENADE_WEAPON_KEYS.map((weaponKey) => renderLoadoutCard(weaponKey))}
                  </div>
                </section>
                <section className="loadout-group flex h-full flex-col">
                  <h3 className="mb-2 text-[10px] font-bold tracking-[0.16em] text-neutral-500 uppercase">
                    {weaponCategoryLabel('knives')}
                  </h3>
                  <div className="space-y-1.5">{renderLoadoutCard(KNIFE_WEAPON_KEY)}</div>
                </section>
              </div>
            </div>
          </div>
          <CharacterPanel
            team="t"
            partyPending={partyPending}
            partySelected={
              partyModel ===
              (equippedByWeapon.get('player_t')
                ? `skin:${equippedByWeapon.get('player_t')!.skin.id}`
                : `player/${stockCharacters.t}/${stockCharacters.t}.mdl`)
            }
            onShowInParty={() => showCharacterInParty('t')}
            model={stockCharacters.t}
            skin={equippedByWeapon.get('player_t')?.skin}
            selected={team === 't'}
            disabled={loadoutLocked}
            onSelect={() => selectTeam('t')}
            className="order-3"
          />
        </div>
      </section>

      {
        <section className="flex-[1] border-t border-white/10 bg-[#080a0e] p-4">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" aria-label="Filter inventory by weapon type">
              {WEAPON_CATEGORIES.filter(
                ({ id }) => id !== (team === 'ct' ? 'player_t' : 'player_ct')
              ).map(({ id, label }) => (
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
                  {id === 'all'
                    ? t('character.all')
                    : id === 'player_ct'
                      ? t('character.ct')
                      : id === 'player_t'
                        ? t('character.t')
                        : label}
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
          {(category === 'all' || category === 'player_ct' || category === 'player_t') &&
            !selectedWeapon && (
              <div className="mt-4 flex flex-wrap gap-3">
                {STOCK_CHARACTERS[
                  category === 'player_ct' ? 'ct' : category === 'player_t' ? 't' : team
                ].map((model) => {
                  const modelTeam =
                    category === 'player_ct' ? 'ct' : category === 'player_t' ? 't' : team
                  const active =
                    stockCharacters[modelTeam] === model &&
                    !equippedByWeapon.has(`player_${modelTeam}`)
                  return (
                    <button
                      key={model}
                      type="button"
                      title={`${t(active ? 'profile.equipped' : 'character.select')}: ${model.toUpperCase()}`}
                      aria-pressed={active}
                      disabled={loadoutLocked || characterPending || changingId !== null}
                      onClick={() => {
                        void useCharacterLoadoutStore
                          .getState()
                          .equipStock(modelTeam, model)
                          .then(() => refresh(false))
                          .catch(() => toast.error(t('character.error')))
                      }}
                      className={twMerge(
                        'w-44 max-w-full flex-none border border-white/15 p-3 text-left',
                        active && 'border-sky-300 bg-sky-300/10'
                      )}
                    >
                      <span className="block h-64">
                        <SkinModelThumbnail
                          cacheKey={`stock-character:${model}`}
                          weaponKey={`player_${modelTeam}`}
                          modelPath={`player/${model}/${model}.mdl`}
                          fallback={model.toUpperCase()}
                        />
                      </span>
                      <span className="block text-sm font-bold">{model.toUpperCase()}</span>
                    </button>
                  )
                })}
              </div>
            )}
          {filteredSkins.length === 0 ? (
            category !== 'all' && category !== 'player_ct' && category !== 'player_t' ? (
              <p className="py-8 text-center text-sm text-neutral-500">
                No unlocked skins for this weapon.
              </p>
            ) : null
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredSkins.map((owned) => (
                <InventoryCard
                  key={owned.skin.id}
                  owned={owned}
                  changing={loadoutLocked || unequippingTeam || changingId === owned.skin.id}
                  selling={selling || quotingId !== null}
                  onEquip={() => setEquipped(owned)}
                  onSell={() => requestSale(owned)}
                  onPreview={() => setPreviewSkin(owned.skin)}
                />
              ))}
            </div>
          )}
        </section>
      }
      {previewSkin && (
        <>
          <SkinPreview
            key={previewSkin.id}
            skin={previewSkin}
            onClose={() => setPreviewSkin(null)}
          />
        </>
      )}
      {sale && (
        <SellConfirmModal
          skinName={sale.owned.skin.name}
          quote={sale.quote}
          busy={selling}
          onClose={() => setSale(null)}
          onConfirm={confirmSale}
        />
      )}
    </section>
  )
}

function InventoryCard({
  owned,
  changing,
  selling,
  onEquip,
  onSell,
  onPreview
}: {
  owned: OwnedSkin
  changing: boolean
  selling: boolean
  onEquip: () => void
  onSell: () => void
  onPreview: () => void
}): JSX.Element {
  const equipped = owned.equippedAt !== null
  return (
    <article className="flex min-h-56 flex-col border border-white/10 bg-neutral-900/90 p-4">
      <SkinCardPreview skin={owned.skin} owned onOpen={onPreview} />
      <p className="text-[10px] font-bold tracking-[0.16em] text-sky-400 uppercase">
        {owned.skin.weaponKey}
      </p>
      {(owned.reviewOnly || owned.skin.status === 'DRAFT') && (
        <p className="text-xs text-amber-200">Custom games only</p>
      )}
      <h3 className="mt-1 text-sm font-semibold">{owned.skin.name}</h3>
      <div className="mt-auto flex justify-end gap-2 border-t border-white/10 pt-3">
        {!owned.reviewOnly && owned.skin.status !== 'DRAFT' && (
          <Button
            className="h-8 px-3 text-xs"
            variant="ghost"
            disabled={changing || selling}
            onClick={onSell}
          >
            {selling ? 'Loading…' : 'Sell'}
          </Button>
        )}
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
  lobbySelected,
  lobbyWeaponId,
  loadoutLocked,
  canChangeLobbyWeapon,
  onSetLobbyWeapon,
  onSetDefaultLobbyWeapon,
  onSelect
}: {
  weaponKey: string
  equipped: OwnedSkin | undefined
  selected: boolean
  lobbySelected: boolean
  lobbyWeaponId: string | null
  loadoutLocked: boolean
  canChangeLobbyWeapon: boolean
  onSetLobbyWeapon: (owned: OwnedSkin) => void
  onSetDefaultLobbyWeapon: (weaponKey: string) => void
  onSelect: () => void
}): JSX.Element {
  const lobbyButtonLabel = lobbySelected ? 'Shown in your lobby' : 'Show this weapon in your lobby'
  return (
    <div
      className={twMerge(
        'loadout-weapon-card group relative grid w-full grid-rows-[5rem_2rem] gap-1 border bg-black/35 p-1.5 text-left transition hover:border-sky-300/70 hover:bg-sky-400/10',
        selected ? 'border-sky-300 bg-sky-400/15 ring-1 ring-sky-300/50' : 'border-white/10'
      )}
    >
      <button
        type="button"
        className="h-20 min-w-0 overflow-hidden"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <LoadoutThumbnail
          key={equipped?.skin.id ?? weaponKey}
          weaponKey={weaponKey}
          equipped={equipped}
        />
      </button>
      {canChangeLobbyWeapon && !equipped?.reviewOnly && equipped?.skin.status !== 'DRAFT' && (
        <button
          type="button"
          className="absolute top-14 right-2 flex size-6 items-center justify-center rounded-none border border-white/20 bg-neutral-950/90 text-sky-200 shadow transition hover:bg-sky-400 hover:text-sky-950 disabled:cursor-not-allowed disabled:opacity-50"
          title={lobbyButtonLabel}
          aria-label={lobbyButtonLabel}
          disabled={loadoutLocked || lobbyWeaponId !== null || lobbySelected}
          onClick={() =>
            equipped ? onSetLobbyWeapon(equipped) : onSetDefaultLobbyWeapon(weaponKey)
          }
        >
          {lobbySelected ? <Check className="size-3.5" /> : <Users className="size-3.5" />}
        </button>
      )}
      <span className="flex min-w-0 items-center justify-center overflow-hidden px-1">
        <span
          className="block truncate text-center text-xs font-bold tracking-wide text-neutral-300"
          title={equipped?.skin.name ?? displayWeapon(weaponKey)}
        >
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
  const cacheKey = equipped
    ? `skin-loadout:v3:${skinId}:${skinPreviewRevision(equipped.skin)}`
    : `default-loadout:v3:${installationPath ?? 'auto'}:${weaponKey}`

  return (
    <span className="weapon-preview-well relative flex h-20 w-full shrink-0 items-center justify-center overflow-hidden bg-slate-950/75">
      <SkinModelThumbnail
        key={cacheKey}
        cacheKey={cacheKey}
        skinId={skinId}
        modelPath={skinId ? undefined : defaultPlayerModelPath(weaponKey)}
        sourceRevision={
          equipped ? skinPreviewRevision(equipped.skin) : (installationPath ?? 'unloaded')
        }
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
