/** Bump cache revision whenever atlas layout, sampling, or pixel encoding changes. */
export const STICKER_CACHE_REVISION = 'rgba4-v2'
export const STICKER_TEXTURE_SCALE = 4
// Payload budget plus fixed headers for the maximum 32 texture records.
export const STICKER_TEXTURE_BYTE_LIMIT = 512 * 1024 * 1024 + 12 + 32 * 12
