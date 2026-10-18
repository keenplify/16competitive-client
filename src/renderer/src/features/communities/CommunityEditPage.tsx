import type { JSX } from 'react'
import { LoaderCircle, Plus, Save } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { COUNTRY_OPTIONS, CountryFlag } from '../../components/CountryFlag'
import { SERVER_CATEGORIES, type ServerCategory } from '../../../../shared/community-directory'
import { useTranslation } from '../i18n/i18n'
import { useCommunitiesStore } from './communities.store'
import { twMerge } from 'tailwind-merge'

export function CommunityEditPage({
  friendsCollapsed
}: {
  friendsCollapsed: boolean
}): JSX.Element {
  const { t, language } = useTranslation()
  const state = useCommunitiesStore()
  return (
    <section
      data-i18n-skip
      className="mx-auto w-full max-w-6xl px-5 pt-5 pb-32 text-white sm:px-8 sm:pt-8"
    >
      <h1 className="text-3xl font-semibold">{t('directory.editTitle')}</h1>
      <form
        id="community-edit-form"
        className="mt-6 space-y-8"
        onSubmit={(event) => {
          event.preventDefault()
          void state.saveEdit()
        }}
      >
        <section className="border border-white/15 bg-neutral-950/80 p-5 sm:p-7">
          <h2 className="text-xl font-semibold">{t('directory.yourCommunity')}</h2>
          <div className="mt-5 grid gap-5">
            <TextField
              id="community-edit-name"
              label={t('directory.name')}
              value={state.editDraft.name}
              maxLength={32}
              required
              disabled={state.saving || state.editLoading}
              onChange={(event) => state.updateDraft({ name: event.target.value })}
            />
            <label className="grid gap-2 text-sm font-medium text-neutral-200">
              <span className="flex items-center gap-2">
                {t('directory.communityCountry')}
                <CountryFlag code={state.editDraft.communityCountryCode} className="h-4 w-6 object-cover" />
              </span>
              <select
                className="h-11 border border-white/15 bg-neutral-950 px-3 text-sm text-white focus:border-amber-400"
                value={state.editDraft.communityCountryCode ?? ''}
                disabled={state.saving || state.editLoading}
                onChange={(event) => state.updateDraft({ communityCountryCode: event.target.value || null })}
              >
                <option value="">{t('directory.noCountry')}</option>
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={country.code} value={country.code}>
                    {new Intl.DisplayNames([language === 'tl' ? 'fil' : language], {
                      type: 'region'
                    }).of(country.code) ?? country.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-neutral-200">
              {t('directory.editDescription')}
              <textarea
                className="min-h-32 w-full resize-y border border-white/15 bg-neutral-950 p-3 text-sm text-white outline-none focus:border-amber-400"
                value={state.editDraft.description}
                maxLength={1000}
                disabled={state.saving || state.editLoading}
                onChange={(event) => state.updateDraft({ description: event.target.value })}
              />
            </label>
          </div>
        </section>

        <section
          className="border border-white/15 bg-neutral-950/80 p-5 sm:p-7"
          aria-labelledby="community-edit-servers"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="community-edit-servers" className="text-xl font-semibold">
              {t('directory.servers')}
            </h2>
            <Button
              type="button"
              variant="secondary"
              disabled={
                state.saving ||
                state.editLoading ||
                state.editLoadError ||
                state.editDraft.servers.length >= 16
              }
              onClick={state.addServer}
            >
              <Plus className="mr-2 size-4" aria-hidden="true" />
              {t('directory.addServer')}
            </Button>
          </div>
          <div className="mt-5 min-h-40 space-y-4" aria-busy={state.editLoading}>
            {state.editLoading ? (
              <div className="relative space-y-4">
                {Array.from({ length: Math.max(1, state.editTarget?.serverCount ?? 0) }, (_, i) => (
                  <div
                    key={i}
                    className={
                      state.editTarget?.serverCount
                        ? 'h-80 animate-pulse border border-white/15 bg-white/5'
                        : 'h-40'
                    }
                  />
                ))}
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-neutral-400">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  {t('directory.loadingSettings')}
                </div>
              </div>
            ) : state.editLoadError ? (
              <p className="py-12 text-center text-sm text-rose-300">
                {t('directory.settingsError')}
              </p>
            ) : state.editDraft.servers.length === 0 ? (
              <p className="py-12 text-center text-sm text-neutral-400">
                {t('directory.noServers')}
              </p>
            ) : (
              state.editDraft.servers.map((server) => (
                <div
                  key={server.id}
                  className="grid gap-4 border border-white/15 p-4 sm:grid-cols-2"
                >
                  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[minmax(10rem,16rem)_1fr] sm:items-center">
                    <div className="grid aspect-video place-items-center overflow-hidden border border-white/15 bg-white/5">
                      {server.imageUrl ? (
                        <img src={server.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="text-xs text-neutral-400">
                          {t('directory.noServerImage')}
                        </span>
                      )}
                    </div>
                    <div className="grid justify-items-start gap-2">
                      <span className="text-sm font-medium">{t('directory.serverImage')}</span>
                      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-white/20 bg-white/5 px-4 text-sm hover:border-sky-300 focus-within:outline-2 focus-within:outline-sky-300 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                        <input
                          type="file"
                          className="sr-only"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          disabled={
                            state.saving ||
                            Boolean(state.uploadingServerId) ||
                            !state.savedServerIds.includes(server.id)
                          }
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0]
                            event.currentTarget.value = ''
                            if (file) void state.uploadServerImage(server.id, file)
                          }}
                        />
                        {state.uploadingServerId === server.id && (
                          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                        )}
                        {t('directory.uploadImage')}
                      </label>
                      <p
                        className="min-h-5 text-xs text-neutral-400"
                        role={state.uploadErrorServerId === server.id ? 'alert' : undefined}
                      >
                        {state.uploadErrorServerId === server.id
                          ? t('directory.imageError')
                          : !state.savedServerIds.includes(server.id)
                            ? t('directory.saveServerFirst')
                            : t('directory.imageLimit')}
                      </p>
                    </div>
                  </div>
                  <TextField
                    id={`community-server-name-${server.id}`}
                    label={t('directory.serverName')}
                    value={server.name}
                    maxLength={64}
                    required
                    disabled={state.saving}
                    onChange={(event) =>
                      state.updateServer(server.id, { name: event.target.value })
                    }
                  />
                  <TextField
                    id={`community-server-host-${server.id}`}
                    label={t('directory.serverHost')}
                    value={server.host}
                    maxLength={253}
                    required
                    disabled={state.saving}
                    placeholder="server.example.com"
                    onChange={(event) =>
                      state.updateServer(server.id, { host: event.target.value })
                    }
                  />
                  <TextField
                    id={`community-server-port-${server.id}`}
                    label={t('directory.serverPort')}
                    type="number"
                    min={1}
                    max={65535}
                    value={server.port}
                    required
                    disabled={state.saving}
                    onChange={(event) =>
                      state.updateServer(server.id, { port: Number(event.target.value) })
                    }
                  />
                  <label className="grid gap-2 text-sm font-medium text-neutral-200">
                    {t('directory.serverCategory')}
                    <select
                      className="h-11 border border-white/10 bg-neutral-950 px-3 text-sm text-white focus:border-amber-400"
                      value={server.category ?? 'other'}
                      disabled={state.saving}
                      onChange={(event) =>
                        state.updateServer(server.id, {
                          category: event.target.value as ServerCategory
                        })
                      }
                    >
                      {SERVER_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {t(`directory.category.${category}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-neutral-200">
                    {t('directory.serverCountry')}
                    <select
                      className="h-11 border border-white/10 bg-neutral-950 px-3 text-sm text-white focus:border-amber-400"
                      value={server.countryCode ?? ''}
                      disabled={state.saving}
                      onChange={(event) =>
                        state.updateServer(server.id, { countryCode: event.target.value || null })
                      }
                    >
                      <option value="">{t('directory.automatic')}</option>
                      {COUNTRY_OPTIONS.map((country) => (
                        <option key={country.code} value={country.code}>
                          {new Intl.DisplayNames([language === 'tl' ? 'fil' : language], {
                            type: 'region'
                          }).of(country.code) ?? country.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-neutral-200">
                    {t('directory.gameVersion')}
                    <select
                      className="h-11 border border-white/10 bg-neutral-950 px-3 text-sm text-white focus:border-amber-400"
                      value={server.gameVersion ?? 'cs16'}
                      disabled={state.saving}
                      onChange={(event) =>
                        state.updateServer(server.id, {
                          gameVersion: event.target.value as 'cs16' | 'cs13'
                        })
                      }
                    >
                      <option value="cs16">Counter-Strike 1.6</option>
                      <option value="cs13">Counter-Strike 1.3</option>
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-self-start text-rose-300 sm:col-span-2"
                    disabled={state.saving}
                    onClick={() => state.removeServer(server.id)}
                  >
                    {t('directory.removeServer')}
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      </form>
      <div
        className={twMerge(
          'fixed right-4 bottom-4 z-30 flex flex-col items-end gap-2 sm:bottom-6',
          friendsCollapsed ? 'md:right-[3.75rem]' : 'md:right-[19rem]'
        )}
      >
        <div
          className="max-w-72 min-h-6 text-right text-sm text-rose-300"
          role="status"
          aria-live="polite"
        >
          {state.saveError ? t('directory.saveError') : ''}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-12 min-w-28 border border-white/25 bg-neutral-800 px-4 text-white shadow-lg shadow-black/50 hover:bg-neutral-700 hover:text-white"
            disabled={state.saving || Boolean(state.uploadingServerId)}
            onClick={state.cancelEdit}
          >
            {t('directory.cancel')}
          </Button>
          <Button
            type="submit"
            form="community-edit-form"
            className="h-12 min-w-44 gap-2 whitespace-nowrap border border-amber-300 shadow-lg shadow-black/50"
            disabled={
              state.saving ||
              Boolean(state.uploadingServerId) ||
              state.editLoading ||
              state.editLoadError ||
              !state.editDraft.name.trim()
            }
          >
            {state.saving ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {t('directory.saveChanges')}
          </Button>
        </div>
      </div>
    </section>
  )
}
