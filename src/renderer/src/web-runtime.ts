declare global {
  interface Window {
    __SIXTEEN_COMPETITIVE_WEB__?: boolean
  }
}

export const isWebRuntime = (): boolean => window.__SIXTEEN_COMPETITIVE_WEB__ === true
