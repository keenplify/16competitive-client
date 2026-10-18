/** Windows 10 and 11 both report NT major version 10. */
export const isSupportedOperatingSystem = (platform: string, release: string): boolean => {
  if (platform !== 'win32') return true
  const major = Number(release.split('.')[0])
  return Number.isInteger(major) && major >= 10
}

export const windowsCompatibilityMessages = {
  en: 'Windows 10 or later is required. Windows 7, Windows 8, and Windows 8.1 are not supported. Upgrade Windows to use 1.6 Competitive.',
  ru: 'Требуется Windows 10 или новее. Windows 7, Windows 8 и Windows 8.1 не поддерживаются. Обновите Windows для использования 1.6 Competitive.',
  tl: 'Kailangan ang Windows 10 o mas bago. Hindi suportado ang Windows 7, Windows 8, at Windows 8.1. I-upgrade ang Windows para magamit ang 1.6 Competitive.',
  th: 'ต้องใช้ Windows 10 หรือใหม่กว่า ไม่รองรับ Windows 7, Windows 8 และ Windows 8.1 โปรดอัปเกรด Windows เพื่อใช้ 1.6 Competitive',
  id: 'Memerlukan Windows 10 atau yang lebih baru. Windows 7, Windows 8, dan Windows 8.1 tidak didukung. Tingkatkan Windows untuk menggunakan 1.6 Competitive.',
  pt: 'É necessário Windows 10 ou posterior. Windows 7, Windows 8 e Windows 8.1 não são compatíveis. Atualize o Windows para usar o 1.6 Competitive.',
  ja: 'Windows 10 以降が必要です。Windows 7、Windows 8、Windows 8.1 はサポートされていません。1.6 Competitive を使用するには Windows をアップグレードしてください。',
  hi: 'Windows 10 या उसके बाद का संस्करण आवश्यक है। Windows 7, Windows 8 और Windows 8.1 समर्थित नहीं हैं। 1.6 Competitive का उपयोग करने के लिए Windows अपग्रेड करें।'
} as const
