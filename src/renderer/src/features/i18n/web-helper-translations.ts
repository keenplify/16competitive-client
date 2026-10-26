import type { SupportedLanguageCode } from './i18n'

const en = {
  'webHelper.title': 'Play with a local launcher',
  'webHelper.description':
    'Optional: use the desktop app or small helper to open your installed Counter-Strike 1.3 or 1.6. Steam play remains available for supported 1.6 matches.',
  'webHelper.check': 'Check local launcher (desktop app)',
  'webHelper.checkDesktop': 'Check desktop app',
  'webHelper.checkRust': 'Check standalone helper',
  'webHelper.linuxTitle': 'Run the helper on Linux',
  'webHelper.linuxDescription':
    'After the download finishes, open a terminal and run these commands. If your browser saved it elsewhere, use that folder instead of Downloads.',
  'webHelper.linuxAfter':
    'Run it once to register the launcher, then return here and check the standalone helper.',
  'webHelper.download': 'Download native helper',
  'webHelper.update': 'Update native helper',
  'webHelper.checking': 'Checking launcher…',
  'webHelper.electronReady': 'Desktop app is ready.',
  'webHelper.rustReady': 'Native helper is ready.',
  'webHelper.electronOutdated':
    'This desktop app is outdated. Update it, or check the native helper below.',
  'webHelper.rustOutdated':
    'This native helper is outdated. Download and open the current helper once, then check again.',
  'webHelper.unavailable':
    'No compatible local launcher answered. You can continue with Steam where supported.',
  'webHelper.continue': 'Continue to Play',
  'webHelper.never': 'Never show again',
  'webHelper.close': 'Close setup'
} as const

export const webHelperTranslations: Record<
  SupportedLanguageCode,
  Record<keyof typeof en, string>
> = {
  en,
  ru: {
    'webHelper.title': 'Играть через локальный запуск',
    'webHelper.description':
      'Необязательно: приложение или небольшой помощник откроет установленную Counter-Strike 1.3 или 1.6. Для поддерживаемых матчей 1.6 остаётся запуск через Steam.',
    'webHelper.check': 'Проверить запуск',
    'webHelper.checking': 'Проверка…',
    'webHelper.checkDesktop': 'Проверить приложение',
    'webHelper.checkRust': 'Проверить помощник',
    'webHelper.linuxTitle': 'Запуск помощника в Linux',
    'webHelper.linuxDescription':
      'После загрузки откройте терминал и выполните команды. Если файл сохранён в другом месте, укажите эту папку вместо Downloads.',
    'webHelper.linuxAfter':
      'Запустите его один раз для регистрации, затем вернитесь сюда и проверьте помощник.',
    'webHelper.download': 'Скачать помощник',
    'webHelper.update': 'Обновить помощник',
    'webHelper.electronReady': 'Приложение готово.',
    'webHelper.rustReady': 'Помощник готов.',
    'webHelper.electronOutdated': 'Приложение устарело. Обновите его или проверьте помощник ниже.',
    'webHelper.rustOutdated':
      'Помощник устарел. Скачайте и один раз откройте новую версию, затем проверьте снова.',
    'webHelper.unavailable':
      'Совместимый локальный запуск не ответил. Где доступно, можно продолжить через Steam.',
    'webHelper.continue': 'Продолжить игру',
    'webHelper.never': 'Больше не показывать',
    'webHelper.close': 'Закрыть настройку'
  },
  tl: {
    'webHelper.title': 'Maglaro gamit ang lokal na launcher',
    'webHelper.description':
      'Opsyonal: buksan ang naka-install na Counter-Strike 1.3 o 1.6 gamit ang desktop app o maliit na helper. Puwede pa rin ang Steam para sa suportadong 1.6 match.',
    'webHelper.check': 'Suriin ang launcher',
    'webHelper.checking': 'Sinusuri…',
    'webHelper.checkDesktop': 'Suriin ang desktop app',
    'webHelper.checkRust': 'Suriin ang helper',
    'webHelper.linuxTitle': 'Patakbuhin ang helper sa Linux',
    'webHelper.linuxDescription':
      'Pagkatapos mag-download, buksan ang terminal at patakbuhin ang mga command. Kung sa ibang folder na-save, gamitin iyon sa halip na Downloads.',
    'webHelper.linuxAfter':
      'Patakbuhin ito nang isang beses para mag-register, saka bumalik dito at suriin ang helper.',
    'webHelper.download': 'I-download ang helper',
    'webHelper.update': 'I-update ang helper',
    'webHelper.electronReady': 'Handa ang desktop app.',
    'webHelper.rustReady': 'Handa ang native helper.',
    'webHelper.electronOutdated':
      'Luma na ang desktop app. I-update ito o suriin ang native helper sa ibaba.',
    'webHelper.rustOutdated':
      'Luma na ang native helper. I-download at buksan nang isang beses ang bago, saka suriin muli.',
    'webHelper.unavailable':
      'Walang tumugon na katugmang launcher. Puwede kang magpatuloy sa Steam kung suportado.',
    'webHelper.continue': 'Magpatuloy sa Play',
    'webHelper.never': 'Huwag nang ipakita',
    'webHelper.close': 'Isara ang setup'
  },
  th: {
    'webHelper.title': 'เล่นด้วยตัวเปิดเกมในเครื่อง',
    'webHelper.description':
      'ตัวเลือกเสริม: ใช้แอปเดสก์ท็อปหรือตัวช่วยขนาดเล็กเพื่อเปิด Counter-Strike 1.3 หรือ 1.6 ที่ติดตั้งไว้ ยังใช้ Steam ได้สำหรับแมตช์ 1.6 ที่รองรับ',
    'webHelper.check': 'ตรวจสอบตัวเปิดเกม',
    'webHelper.checking': 'กำลังตรวจสอบ…',
    'webHelper.checkDesktop': 'ตรวจสอบแอปเดสก์ท็อป',
    'webHelper.checkRust': 'ตรวจสอบตัวช่วย',
    'webHelper.linuxTitle': 'เรียกใช้ตัวช่วยบน Linux',
    'webHelper.linuxDescription':
      'เมื่อดาวน์โหลดเสร็จ เปิดเทอร์มินัลและเรียกใช้คำสั่งเหล่านี้ หากบันทึกไว้ที่อื่น ให้ใช้โฟลเดอร์นั้นแทน Downloads',
    'webHelper.linuxAfter': 'เรียกใช้หนึ่งครั้งเพื่อลงทะเบียน แล้วกลับมาตรวจสอบตัวช่วยที่นี่',
    'webHelper.download': 'ดาวน์โหลดตัวช่วย',
    'webHelper.update': 'อัปเดตตัวช่วย',
    'webHelper.electronReady': 'แอปเดสก์ท็อปพร้อมแล้ว',
    'webHelper.rustReady': 'ตัวช่วยพร้อมแล้ว',
    'webHelper.electronOutdated': 'แอปเดสก์ท็อปล้าสมัยแล้ว อัปเดตแอปหรือตรวจสอบตัวช่วยด้านล่าง',
    'webHelper.rustOutdated':
      'ตัวช่วยล้าสมัยแล้ว ดาวน์โหลดและเปิดรุ่นใหม่หนึ่งครั้ง แล้วตรวจสอบอีกครั้ง',
    'webHelper.unavailable': 'ไม่มีตัวเปิดเกมที่รองรับตอบกลับ คุณยังใช้ Steam ได้เมื่อรองรับ',
    'webHelper.continue': 'เล่นต่อ',
    'webHelper.never': 'ไม่ต้องแสดงอีก',
    'webHelper.close': 'ปิดการตั้งค่า'
  },
  id: {
    'webHelper.title': 'Main dengan peluncur lokal',
    'webHelper.description':
      'Opsional: gunakan aplikasi desktop atau helper kecil untuk membuka Counter-Strike 1.3 atau 1.6 yang terpasang. Steam tetap tersedia untuk pertandingan 1.6 yang didukung.',
    'webHelper.check': 'Periksa peluncur',
    'webHelper.checking': 'Memeriksa…',
    'webHelper.checkDesktop': 'Periksa aplikasi desktop',
    'webHelper.checkRust': 'Periksa helper',
    'webHelper.linuxTitle': 'Jalankan helper di Linux',
    'webHelper.linuxDescription':
      'Setelah unduhan selesai, buka terminal dan jalankan perintah ini. Jika file tersimpan di tempat lain, gunakan folder tersebut sebagai ganti Downloads.',
    'webHelper.linuxAfter': 'Jalankan sekali untuk mendaftar, lalu kembali dan periksa helper.',
    'webHelper.download': 'Unduh helper',
    'webHelper.update': 'Perbarui helper',
    'webHelper.electronReady': 'Aplikasi desktop siap.',
    'webHelper.rustReady': 'Helper siap.',
    'webHelper.electronOutdated':
      'Aplikasi desktop sudah lama. Perbarui atau periksa helper di bawah.',
    'webHelper.rustOutdated':
      'Helper sudah lama. Unduh dan buka versi terbaru sekali, lalu periksa lagi.',
    'webHelper.unavailable':
      'Tidak ada peluncur lokal yang merespons. Anda dapat melanjutkan lewat Steam jika didukung.',
    'webHelper.continue': 'Lanjut ke Play',
    'webHelper.never': 'Jangan tampilkan lagi',
    'webHelper.close': 'Tutup pengaturan'
  },
  pt: {
    'webHelper.title': 'Jogar com iniciador local',
    'webHelper.description':
      'Opcional: use o aplicativo ou um pequeno auxiliar para abrir o Counter-Strike 1.3 ou 1.6 instalado. O Steam continua disponível para partidas 1.6 compatíveis.',
    'webHelper.check': 'Verificar iniciador',
    'webHelper.checking': 'Verificando…',
    'webHelper.checkDesktop': 'Verificar aplicativo',
    'webHelper.checkRust': 'Verificar auxiliar',
    'webHelper.linuxTitle': 'Executar o auxiliar no Linux',
    'webHelper.linuxDescription':
      'Após o download, abra um terminal e execute estes comandos. Se o arquivo estiver em outra pasta, use essa pasta no lugar de Downloads.',
    'webHelper.linuxAfter':
      'Execute uma vez para registrar e depois volte aqui para verificar o auxiliar.',
    'webHelper.download': 'Baixar auxiliar',
    'webHelper.update': 'Atualizar auxiliar',
    'webHelper.electronReady': 'Aplicativo pronto.',
    'webHelper.rustReady': 'Auxiliar pronto.',
    'webHelper.electronOutdated':
      'O aplicativo está desatualizado. Atualize-o ou verifique o auxiliar abaixo.',
    'webHelper.rustOutdated':
      'O auxiliar está desatualizado. Baixe e abra a versão atual uma vez, depois verifique novamente.',
    'webHelper.unavailable':
      'Nenhum iniciador compatível respondeu. Você pode continuar pelo Steam quando houver suporte.',
    'webHelper.continue': 'Continuar para Jogar',
    'webHelper.never': 'Não mostrar novamente',
    'webHelper.close': 'Fechar configuração'
  },
  ja: {
    'webHelper.title': 'ローカルランチャーでプレイ',
    'webHelper.description':
      '任意: デスクトップアプリまたは小さなヘルパーで、インストール済みの Counter-Strike 1.3 / 1.6 を起動します。対応する 1.6 マッチでは Steam も利用できます。',
    'webHelper.check': 'ランチャーを確認',
    'webHelper.checking': '確認中…',
    'webHelper.checkDesktop': 'デスクトップアプリを確認',
    'webHelper.checkRust': 'ヘルパーを確認',
    'webHelper.linuxTitle': 'Linux でヘルパーを実行',
    'webHelper.linuxDescription':
      'ダウンロード後、端末で次のコマンドを実行してください。別の場所に保存した場合は Downloads をそのフォルダーに変更してください。',
    'webHelper.linuxAfter': '一度実行して登録し、ここに戻ってヘルパーを確認してください。',
    'webHelper.download': 'ヘルパーをダウンロード',
    'webHelper.update': 'ヘルパーを更新',
    'webHelper.electronReady': 'デスクトップアプリを利用できます。',
    'webHelper.rustReady': 'ヘルパーを利用できます。',
    'webHelper.electronOutdated':
      'デスクトップアプリが古いです。更新するか、下のヘルパーを確認してください。',
    'webHelper.rustOutdated':
      'ヘルパーが古いです。最新版をダウンロードして一度開き、再確認してください。',
    'webHelper.unavailable':
      '対応するランチャーから応答がありません。対応する場合は Steam で続行できます。',
    'webHelper.continue': 'プレイに進む',
    'webHelper.never': '今後表示しない',
    'webHelper.close': '設定を閉じる'
  },
  hi: {
    'webHelper.title': 'लोकल लॉन्चर से खेलें',
    'webHelper.description':
      'वैकल्पिक: इंस्टॉल किए गए Counter-Strike 1.3 या 1.6 को डेस्कटॉप ऐप या छोटे हेल्पर से खोलें। समर्थित 1.6 मैचों के लिए Steam उपलब्ध रहेगा।',
    'webHelper.check': 'लॉन्चर जाँचें',
    'webHelper.checking': 'जाँच हो रही है…',
    'webHelper.checkDesktop': 'डेस्कटॉप ऐप जाँचें',
    'webHelper.checkRust': 'हेल्पर जाँचें',
    'webHelper.linuxTitle': 'Linux पर हेल्पर चलाएँ',
    'webHelper.linuxDescription':
      'डाउनलोड के बाद टर्मिनल खोलकर ये कमांड चलाएँ। फ़ाइल कहीं और सहेजी हो तो Downloads की जगह उस फ़ोल्डर का उपयोग करें।',
    'webHelper.linuxAfter': 'पंजीकरण के लिए इसे एक बार चलाएँ, फिर यहाँ लौटकर हेल्पर जाँचें।',
    'webHelper.download': 'हेल्पर डाउनलोड करें',
    'webHelper.update': 'हेल्पर अपडेट करें',
    'webHelper.electronReady': 'डेस्कटॉप ऐप तैयार है।',
    'webHelper.rustReady': 'हेल्पर तैयार है।',
    'webHelper.electronOutdated': 'डेस्कटॉप ऐप पुराना है। इसे अपडेट करें या नीचे हेल्पर जाँचें।',
    'webHelper.rustOutdated':
      'हेल्पर पुराना है। नया संस्करण डाउनलोड करके एक बार खोलें, फिर दोबारा जाँचें।',
    'webHelper.unavailable':
      'कोई संगत लोकल लॉन्चर नहीं मिला। समर्थित होने पर Steam से जारी रख सकते हैं।',
    'webHelper.continue': 'Play पर जाएँ',
    'webHelper.never': 'फिर कभी न दिखाएँ',
    'webHelper.close': 'सेटअप बंद करें'
  }
}
