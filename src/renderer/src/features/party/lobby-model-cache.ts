const DATABASE_NAME = 'lobby-model-cache'
const DATABASE_SCHEMA_VERSION = 1
const PRESENTATIONS_STORE = 'presentations'
const METADATA_STORE = 'metadata'
const APP_VERSION_KEY = 'app-version'

export type CachedLobbyMesh = {
  animationFrames: Float32Array[]
  uv: Float32Array
  textureIndex: number
}

export type CachedLobbyTexture = {
  pixels: Uint8ClampedArray
  width: number
  height: number
}

export type CachedLobbyPresentation = {
  fps: number
  frameCount: number
  boneNames: string[]
  boneTransforms: Float32Array[][]
  meshes: CachedLobbyMesh[]
  textures: CachedLobbyTexture[]
}

const memoryCache = new Map<string, CachedLobbyPresentation>()
let databasePromise: Promise<IDBDatabase> | null = null
let versionCheckPromise: Promise<IDBDatabase> | null = null

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true })
    transaction.addEventListener('error', () => reject(transaction.error), { once: true })
  })

const openDatabase = (): Promise<IDBDatabase> => {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_SCHEMA_VERSION)
    request.addEventListener(
      'upgradeneeded',
      () => {
        const database = request.result
        if (!database.objectStoreNames.contains(PRESENTATIONS_STORE)) {
          database.createObjectStore(PRESENTATIONS_STORE)
        }
        if (!database.objectStoreNames.contains(METADATA_STORE)) {
          database.createObjectStore(METADATA_STORE)
        }
      },
      { once: true }
    )
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
  return databasePromise
}

const versionedDatabase = (): Promise<IDBDatabase> => {
  if (versionCheckPromise) return versionCheckPromise
  versionCheckPromise = Promise.all([openDatabase(), window.api.updater.getCurrentVersion()]).then(
    async ([database, appVersion]) => {
      const transaction = database.transaction([METADATA_STORE, PRESENTATIONS_STORE], 'readwrite')
      const metadata = transaction.objectStore(METADATA_STORE)
      const cachedVersion = await requestResult(metadata.get(APP_VERSION_KEY))
      if (cachedVersion !== appVersion) {
        transaction.objectStore(PRESENTATIONS_STORE).clear()
        metadata.put(appVersion, APP_VERSION_KEY)
        memoryCache.clear()
      }
      await transactionComplete(transaction)
      return database
    }
  )
  return versionCheckPromise
}

export const readCachedLobbyPresentation = async (
  cacheKey: string
): Promise<CachedLobbyPresentation | null> => {
  const memoryValue = memoryCache.get(cacheKey)
  if (memoryValue) return memoryValue

  try {
    const database = await versionedDatabase()
    const transaction = database.transaction(PRESENTATIONS_STORE, 'readonly')
    const value = (await requestResult(
      transaction.objectStore(PRESENTATIONS_STORE).get(cacheKey)
    )) as CachedLobbyPresentation | undefined
    await transactionComplete(transaction)
    if (value) memoryCache.set(cacheKey, value)
    return value ?? null
  } catch (error) {
    console.warn('[Lobby] Could not read prepared model cache', error)
    return null
  }
}

export const writeCachedLobbyPresentation = async (
  cacheKey: string,
  presentation: CachedLobbyPresentation
): Promise<void> => {
  memoryCache.set(cacheKey, presentation)
  try {
    const database = await versionedDatabase()
    const transaction = database.transaction(PRESENTATIONS_STORE, 'readwrite')
    transaction.objectStore(PRESENTATIONS_STORE).put(presentation, cacheKey)
    await transactionComplete(transaction)
  } catch (error) {
    console.warn('[Lobby] Could not persist prepared model cache', error)
  }
}
