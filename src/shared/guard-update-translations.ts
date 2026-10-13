/** Shared by the native startup banner and renderer language catalogs. */
export const guardUpdateTranslations = {
  en: {
    starting: 'Starting launcher…',
    checking: 'Checking for updates…',
    downloading: 'Downloading update…',
    restarting: 'Restarting launcher…',
    failed: 'Update failed. Check your connection and retry.',
    retry: 'Retry',
    exit: 'Exit launcher',
    anticheat: 'Anti-cheat'
  },
  ru: {
    starting: 'Запуск лаунчера…',
    checking: 'Проверка обновлений…',
    downloading: 'Загрузка обновления…',
    restarting: 'Перезапуск лаунчера…',
    failed: 'Обновление не удалось. Проверьте соединение и повторите.',
    retry: 'Повторить',
    exit: 'Выйти',
    anticheat: 'Античит'
  },
  tl: {
    starting: 'Sinisimulan ang launcher…',
    checking: 'Tinitingnan ang mga update…',
    downloading: 'Dina-download ang update…',
    restarting: 'Nire-restart ang launcher…',
    failed: 'Hindi na-update. Tingnan ang koneksyon at subukan muli.',
    retry: 'Subukan muli',
    exit: 'Isara ang launcher',
    anticheat: 'Anti-cheat'
  },
  th: {
    starting: 'กำลังเริ่มลอนเชอร์…',
    checking: 'กำลังตรวจสอบอัปเดต…',
    downloading: 'กำลังดาวน์โหลดอัปเดต…',
    restarting: 'กำลังเริ่มลอนเชอร์ใหม่…',
    failed: 'อัปเดตไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง',
    retry: 'ลองอีกครั้ง',
    exit: 'ออกจากลอนเชอร์',
    anticheat: 'ระบบป้องกันโกง'
  },
  id: {
    starting: 'Memulai launcher…',
    checking: 'Memeriksa pembaruan…',
    downloading: 'Mengunduh pembaruan…',
    restarting: 'Memulai ulang launcher…',
    failed: 'Pembaruan gagal. Periksa koneksi dan coba lagi.',
    retry: 'Coba lagi',
    exit: 'Keluar',
    anticheat: 'Antikecurangan'
  },
  hi: {
    starting: 'लॉन्चर शुरू हो रहा है…',
    checking: 'अपडेट जाँचे जा रहे हैं…',
    downloading: 'अपडेट डाउनलोड हो रहा है…',
    restarting: 'लॉन्चर फिर शुरू हो रहा है…',
    failed: 'अपडेट विफल। कनेक्शन जाँचें और फिर कोशिश करें।',
    retry: 'फिर कोशिश करें',
    exit: 'लॉन्चर बंद करें',
    anticheat: 'एंटी-चीट'
  },
  pt: {
    starting: 'Iniciando launcher…',
    checking: 'Verificando atualizações…',
    downloading: 'Baixando atualização…',
    restarting: 'Reiniciando launcher…',
    failed: 'Falha na atualização. Verifique a conexão e tente novamente.',
    retry: 'Tentar novamente',
    exit: 'Sair',
    anticheat: 'Antitrapaça'
  },
  ja: {
    starting: 'ランチャーを起動中…',
    checking: '更新を確認中…',
    downloading: '更新をダウンロード中…',
    restarting: 'ランチャーを再起動中…',
    failed: '更新に失敗しました。接続を確認して再試行してください。',
    retry: '再試行',
    exit: '終了',
    anticheat: 'アンチチート'
  }
} as const

export type GuardLanguage = keyof typeof guardUpdateTranslations
export type GuardUpdateCopy = { [K in keyof typeof guardUpdateTranslations.en]: string }
