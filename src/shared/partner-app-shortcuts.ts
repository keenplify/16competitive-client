export const INSTALLED_APP_ID = 'com.keenplify.16competitive'
export const DEFAULT_APP_NAME = '1.6 Competitive'
export const desktopExecArgument = (value: string): string => {
  if (/[\r\n\0]/.test(value)) throw new Error('Invalid desktop executable path')
  const quoted = '"' + value.replace(/%/g, '%%').replace(/[\\"`$]/g, '\\$&') + '"'
  return quoted.replace(/\\/g, '\\\\')
}
export const partnerDesktopEntry = (name: string, executable: string, icon: string): string => {
  if (/[\r\n\0]/.test(name + icon)) throw new Error('Invalid desktop entry')
  const field = (value: string): string => value.replace(/\\/g, '\\\\')
  return `[Desktop Entry]\nType=Application\nVersion=1.0\nName=${field(name)}\nExec=${desktopExecArgument(executable)}\nIcon=${field(icon)}\nTerminal=false\nCategories=Game;\nStartupWMClass=${INSTALLED_APP_ID}\nX-16Competitive-Managed=true\n`
}
