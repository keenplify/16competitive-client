import type { SupportedLanguageCode } from './i18n'

const en = {
  'webHelper.discordJoined': 'Joined party from Discord.',
  'webHelper.discordInviteFailed': 'The Discord party invite is no longer available.',
  'webHelper.perkLaunch': 'Launch your installed Counter-Strike 1.3 or 1.6 from the browser.',
  'webHelper.perkSettings': 'Choose game folders and display settings on this device.',
  'webHelper.perkEnhancements': 'Use supported in-game enhancements in Counter-Strike 1.6.',
  'webHelper.perkUpdates': 'Keep the native helper up to date automatically.',
  'webHelper.localSettings':
    'Saved by the native helper on this computer. Installation paths stay on your device.',
  'webHelper.folder16': 'Counter-Strike 1.6 installation folder',
  'webHelper.choose16': 'Choose 1.6 folder',
  'webHelper.enhancements': 'In-game enhancements',
  'webHelper.killCards': 'Kill cards',
  'webHelper.invalidFolder':
    'That folder is not a complete Counter-Strike installation. Choose the folder containing the game executable and cstrike files. You can select another folder.',
  'webHelper.settingsError':
    'Could not access helper settings or validate the selected folder. Reconnect the helper and try again.',
  'webHelper.settingsLoading': 'Loading helper settings…',
  'webHelper.settingsSaving': 'Saving helper settings…',
  'webHelper.retry': 'Retry',
  'webHelper.steamLaunchHint':
    'For Steam launch, close Counter-Strike first. If it is already running, use Copy connection and paste the command into the game console.',
  'webHelper.steamCredentialFallback':
    'Steam cannot safely pass this match’s credentials. Use Copy connection and paste the command into the Counter-Strike console.',
  'webHelper.title': 'Play with the native helper',
  'webHelper.description':
    'Use the small native helper to launch your installed Counter-Strike 1.3 or 1.6 from the browser. You can also continue with Steam for supported 1.6 matches.',
  'webHelper.check': 'Check local launcher (desktop app)',
  'webHelper.checkDesktop': 'Check desktop app',
  'webHelper.checkRust': 'Check standalone helper',
  'webHelper.linuxTitle': 'Run the helper on Linux',
  'webHelper.linuxDescription':
    'After the download finishes, open a terminal and run these commands. If your browser saved it elsewhere, use that folder instead of Downloads.',
  'webHelper.linuxAfter':
    'Run the full command below. This window closes automatically when setup is verified.',
  'webHelper.copyCommand': 'Copy command',
  'webHelper.commandCopied': 'Command copied.',
  'webHelper.copyFailed': 'Could not copy. Try again.',
  'webHelper.download': 'Download native helper',
  'webHelper.viewSourceCode': 'View Source Code',
  'webHelper.update': 'Update native helper',
  'webHelper.checking': 'Checking native helper…',
  'webHelper.success': 'Helper setup successfully',
  'webHelper.electronReady': 'Desktop app is ready.',
  'webHelper.rustReady': 'Native helper is ready.',
  'webHelper.installedVersion': 'Installed: {{version}}',
  'webHelper.latestVersion': 'Latest: {{version}}',
  'webHelper.olderVersion': 'Older version',
  'webHelper.updateAvailable': 'Update available',
  'webHelper.upToDate': 'Up to date',
  'webHelper.versionUnavailable': 'Helper version unavailable',
  'webHelper.electronOutdated':
    'This desktop app is outdated. Update it, or check the native helper below.',
  'webHelper.rustOutdated':
    'This native helper is outdated. Download and open the current helper once, then check again.',
  'webHelper.unavailable':
    'The native helper did not respond. Download it, or continue with Steam where supported.',
  'webHelper.notNow': 'Not now',
  'webHelper.never': 'Never show again',
  'webHelper.back': 'Back',
  'webHelper.close': 'Close setup'
} as const

export const webHelperTranslations: Record<
  SupportedLanguageCode,
  Record<keyof typeof en, string>
> = {
  en,
  ru: {
    'webHelper.discordJoined': 'Вы присоединились к группе через Discord.',
    'webHelper.discordInviteFailed': 'Приглашение в группу Discord больше недоступно.',
    'webHelper.perkLaunch': 'Запускайте установленную Counter-Strike 1.3 или 1.6 из браузера.',
    'webHelper.perkSettings': 'Выбирайте папки игры и параметры экрана на этом устройстве.',
    'webHelper.perkEnhancements': 'Используйте поддерживаемые улучшения в Counter-Strike 1.6.',
    'webHelper.perkUpdates': 'Помощник обновляется автоматически.',
    'webHelper.localSettings':
      'Помощник сохраняет настройки на этом компьютере. Пути установки остаются на устройстве.',
    'webHelper.folder16': 'Папка установки Counter-Strike 1.6',
    'webHelper.choose16': 'Выбрать папку 1.6',
    'webHelper.enhancements': 'Улучшения в игре',
    'webHelper.killCards': 'Карточки убийств',
    'webHelper.invalidFolder':
      'В этой папке нет полной установки Counter-Strike. Выберите папку с исполняемым файлом игры и файлами cstrike. Можно выбрать другую папку.',
    'webHelper.settingsError':
      'Не удалось открыть настройки помощника или проверить папку. Подключите помощник и повторите попытку.',
    'webHelper.settingsLoading': 'Загрузка настроек помощника…',
    'webHelper.settingsSaving': 'Сохранение настроек помощника…',
    'webHelper.retry': 'Повторить',
    'webHelper.steamLaunchHint':
      'Перед запуском через Steam закройте Counter-Strike. Если игра уже запущена, нажмите «Копировать подключение» и вставьте команду в консоль игры.',
    'webHelper.steamCredentialFallback':
      'Steam не может корректно передать данные подключения этого матча. Нажмите «Копировать подключение» и вставьте команду в консоль Counter-Strike.',
    'webHelper.title': 'Играть с нативным помощником',
    'webHelper.description':
      'Небольшой нативный помощник запускает установленную Counter-Strike 1.3 или 1.6 из браузера. Для поддерживаемых матчей 1.6 можно продолжить через Steam.',
    'webHelper.check': 'Проверить запуск',
    'webHelper.checking': 'Проверка нативного помощника…',
    'webHelper.success': 'Помощник успешно настроен',
    'webHelper.checkDesktop': 'Проверить приложение',
    'webHelper.checkRust': 'Проверить помощник',
    'webHelper.linuxTitle': 'Запуск помощника в Linux',
    'webHelper.linuxDescription':
      'После загрузки откройте терминал и выполните команды. Если файл сохранён в другом месте, укажите эту папку вместо Downloads.',
    'webHelper.linuxAfter':
      'Выполните полную команду ниже. После проверки настройки это окно закроется автоматически.',
    'webHelper.copyCommand': 'Копировать команду',
    'webHelper.commandCopied': 'Команда скопирована.',
    'webHelper.copyFailed': 'Не удалось скопировать. Повторите попытку.',
    'webHelper.download': 'Скачать помощник',
    'webHelper.viewSourceCode': 'Посмотреть исходный код',
    'webHelper.update': 'Обновить помощник',
    'webHelper.electronReady': 'Приложение готово.',
    'webHelper.rustReady': 'Помощник готов.',
    'webHelper.installedVersion': 'Установлено: {{version}}',
    'webHelper.latestVersion': 'Последняя версия: {{version}}',
    'webHelper.olderVersion': 'Старая версия',
    'webHelper.updateAvailable': 'Доступно обновление',
    'webHelper.upToDate': 'Актуальная версия',
    'webHelper.versionUnavailable': 'Версия помощника недоступна',
    'webHelper.electronOutdated': 'Приложение устарело. Обновите его или проверьте помощник ниже.',
    'webHelper.rustOutdated':
      'Помощник устарел. Скачайте и один раз откройте новую версию, затем проверьте снова.',
    'webHelper.unavailable':
      'Нативный помощник не ответил. Скачайте его или продолжите через Steam, где это поддерживается.',
    'webHelper.notNow': 'Не сейчас',
    'webHelper.never': 'Больше не показывать',
    'webHelper.back': 'Назад',
    'webHelper.close': 'Закрыть настройку'
  },
  tl: {
    'webHelper.discordJoined': 'Sumali sa party mula sa Discord.',
    'webHelper.discordInviteFailed': 'Hindi na magagamit ang imbitasyon sa party sa Discord.',
    'webHelper.perkLaunch': 'Buksan ang naka-install na Counter-Strike 1.3 o 1.6 mula sa browser.',
    'webHelper.perkSettings': 'Pumili ng game folder at display settings sa device na ito.',
    'webHelper.perkEnhancements':
      'Gamitin ang suportadong in-game enhancements sa Counter-Strike 1.6.',
    'webHelper.perkUpdates': 'Awtomatikong panatilihing updated ang native helper.',
    'webHelper.localSettings':
      'Sine-save ng native helper sa computer na ito. Nananatili sa device mo ang mga installation path.',
    'webHelper.folder16': 'Folder ng Counter-Strike 1.6',
    'webHelper.choose16': 'Pumili ng folder ng 1.6',
    'webHelper.enhancements': 'In-game enhancements',
    'webHelper.killCards': 'Kill cards',
    'webHelper.invalidFolder':
      'Hindi kumpleto ang Counter-Strike sa folder na ito. Piliin ang folder na may game executable at cstrike files. Puwedeng pumili ng ibang folder.',
    'webHelper.settingsError':
      'Hindi mabuksan ang helper settings o ma-validate ang folder. Ikonekta muli ang helper at subukan ulit.',
    'webHelper.settingsLoading': 'Nilo-load ang helper settings…',
    'webHelper.settingsSaving': 'Sine-save ang helper settings…',
    'webHelper.retry': 'Subukan ulit',
    'webHelper.steamLaunchHint':
      'Isara muna ang Counter-Strike bago mag-launch sa Steam. Kung bukas na ito, gamitin ang Copy connection at i-paste ang command sa game console.',
    'webHelper.steamCredentialFallback':
      'Hindi maipapasa nang tama ng Steam ang credentials ng match na ito. Gamitin ang Copy connection at i-paste ang command sa Counter-Strike console.',
    'webHelper.title': 'Maglaro gamit ang native helper',
    'webHelper.description':
      'Gamitin ang maliit na native helper para buksan ang naka-install na Counter-Strike 1.3 o 1.6 mula sa browser. Puwede ring magpatuloy sa Steam para sa suportadong 1.6 match.',
    'webHelper.check': 'Suriin ang launcher',
    'webHelper.checking': 'Sinusuri ang native helper…',
    'webHelper.success': 'Matagumpay ang setup ng helper',
    'webHelper.checkDesktop': 'Suriin ang desktop app',
    'webHelper.checkRust': 'Suriin ang helper',
    'webHelper.linuxTitle': 'Patakbuhin ang helper sa Linux',
    'webHelper.linuxDescription':
      'Pagkatapos mag-download, buksan ang terminal at patakbuhin ang mga command. Kung sa ibang folder na-save, gamitin iyon sa halip na Downloads.',
    'webHelper.linuxAfter':
      'Patakbuhin ang buong command sa ibaba. Awtomatikong magsasara ang window kapag na-verify ang setup.',
    'webHelper.copyCommand': 'Kopyahin ang command',
    'webHelper.commandCopied': 'Nakopya ang command.',
    'webHelper.copyFailed': 'Hindi makopya. Subukan muli.',
    'webHelper.download': 'I-download ang helper',
    'webHelper.viewSourceCode': 'Tingnan ang source code',
    'webHelper.update': 'I-update ang helper',
    'webHelper.electronReady': 'Handa ang desktop app.',
    'webHelper.rustReady': 'Handa ang native helper.',
    'webHelper.installedVersion': 'Naka-install: {{version}}',
    'webHelper.latestVersion': 'Pinakabago: {{version}}',
    'webHelper.olderVersion': 'Lumang bersyon',
    'webHelper.updateAvailable': 'May update',
    'webHelper.upToDate': 'Napapanahon',
    'webHelper.versionUnavailable': 'Hindi makita ang bersyon ng helper',
    'webHelper.electronOutdated':
      'Luma na ang desktop app. I-update ito o suriin ang native helper sa ibaba.',
    'webHelper.rustOutdated':
      'Luma na ang native helper. I-download at buksan nang isang beses ang bago, saka suriin muli.',
    'webHelper.unavailable':
      'Hindi tumugon ang native helper. I-download ito o magpatuloy sa Steam kung suportado.',
    'webHelper.notNow': 'Huwag muna',
    'webHelper.never': 'Huwag nang ipakita',
    'webHelper.back': 'Bumalik',
    'webHelper.close': 'Isara ang setup'
  },
  th: {
    'webHelper.discordJoined': 'เข้าร่วมปาร์ตี้จาก Discord แล้ว',
    'webHelper.discordInviteFailed': 'คำเชิญปาร์ตี้ Discord นี้ใช้ไม่ได้แล้ว',
    'webHelper.perkLaunch': 'เปิด Counter-Strike 1.3 หรือ 1.6 ที่ติดตั้งไว้จากเบราว์เซอร์',
    'webHelper.perkSettings': 'เลือกโฟลเดอร์เกมและการตั้งค่าจอแสดงผลบนอุปกรณ์นี้',
    'webHelper.perkEnhancements': 'ใช้การปรับปรุงภายในเกมที่รองรับใน Counter-Strike 1.6',
    'webHelper.perkUpdates': 'อัปเดตตัวช่วยเนทีฟโดยอัตโนมัติ',
    'webHelper.localSettings':
      'ตัวช่วยเนทีฟบันทึกบนคอมพิวเตอร์นี้ เส้นทางการติดตั้งจะอยู่บนอุปกรณ์ของคุณ',
    'webHelper.folder16': 'โฟลเดอร์ติดตั้ง Counter-Strike 1.6',
    'webHelper.choose16': 'เลือกโฟลเดอร์ 1.6',
    'webHelper.enhancements': 'การปรับปรุงภายในเกม',
    'webHelper.killCards': 'การ์ดการสังหาร',
    'webHelper.invalidFolder':
      'โฟลเดอร์นี้มีไฟล์ Counter-Strike ไม่ครบ โปรดเลือกโฟลเดอร์ที่มีไฟล์เปิดเกมและไฟล์ cstrike คุณสามารถเลือกโฟลเดอร์อื่นได้',
    'webHelper.settingsError':
      'เข้าถึงการตั้งค่าหรือตรวจสอบโฟลเดอร์ไม่ได้ เชื่อมต่อตัวช่วยอีกครั้งแล้วลองใหม่',
    'webHelper.settingsLoading': 'กำลังโหลดการตั้งค่าตัวช่วย…',
    'webHelper.settingsSaving': 'กำลังบันทึกการตั้งค่าตัวช่วย…',
    'webHelper.retry': 'ลองใหม่',
    'webHelper.steamLaunchHint':
      'ปิด Counter-Strike ก่อนเปิดผ่าน Steam หากเกมเปิดอยู่แล้ว ให้ใช้คัดลอกการเชื่อมต่อแล้ววางคำสั่งในคอนโซลเกม',
    'webHelper.steamCredentialFallback':
      'Steam ไม่สามารถส่งข้อมูลการเชื่อมต่อของแมตช์นี้ได้อย่างถูกต้อง ใช้คัดลอกการเชื่อมต่อแล้ววางคำสั่งในคอนโซล Counter-Strike',
    'webHelper.title': 'เล่นด้วยตัวช่วยเนทีฟ',
    'webHelper.description':
      'ใช้ตัวช่วยเนทีฟขนาดเล็กเพื่อเปิด Counter-Strike 1.3 หรือ 1.6 ที่ติดตั้งไว้จากเบราว์เซอร์ หรือใช้ Steam สำหรับแมตช์ 1.6 ที่รองรับ',
    'webHelper.check': 'ตรวจสอบตัวเปิดเกม',
    'webHelper.checking': 'กำลังตรวจสอบตัวช่วยเนทีฟ…',
    'webHelper.success': 'ตั้งค่าตัวช่วยสำเร็จแล้ว',
    'webHelper.checkDesktop': 'ตรวจสอบแอปเดสก์ท็อป',
    'webHelper.checkRust': 'ตรวจสอบตัวช่วย',
    'webHelper.linuxTitle': 'เรียกใช้ตัวช่วยบน Linux',
    'webHelper.linuxDescription':
      'เมื่อดาวน์โหลดเสร็จ เปิดเทอร์มินัลและเรียกใช้คำสั่งเหล่านี้ หากบันทึกไว้ที่อื่น ให้ใช้โฟลเดอร์นั้นแทน Downloads',
    'webHelper.linuxAfter':
      'เรียกใช้คำสั่งทั้งหมดด้านล่าง หน้าต่างนี้จะปิดอัตโนมัติเมื่อตรวจสอบการตั้งค่าสำเร็จ',
    'webHelper.copyCommand': 'คัดลอกคำสั่ง',
    'webHelper.commandCopied': 'คัดลอกคำสั่งแล้ว',
    'webHelper.copyFailed': 'คัดลอกไม่ได้ โปรดลองอีกครั้ง',
    'webHelper.download': 'ดาวน์โหลดตัวช่วย',
    'webHelper.viewSourceCode': 'ดูซอร์สโค้ด',
    'webHelper.update': 'อัปเดตตัวช่วย',
    'webHelper.electronReady': 'แอปเดสก์ท็อปพร้อมแล้ว',
    'webHelper.rustReady': 'ตัวช่วยพร้อมแล้ว',
    'webHelper.installedVersion': 'ติดตั้งแล้ว: {{version}}',
    'webHelper.latestVersion': 'ล่าสุด: {{version}}',
    'webHelper.olderVersion': 'เวอร์ชันเก่า',
    'webHelper.updateAvailable': 'มีอัปเดต',
    'webHelper.upToDate': 'เป็นเวอร์ชันล่าสุด',
    'webHelper.versionUnavailable': 'ไม่พบเวอร์ชันตัวช่วย',
    'webHelper.electronOutdated': 'แอปเดสก์ท็อปล้าสมัยแล้ว อัปเดตแอปหรือตรวจสอบตัวช่วยด้านล่าง',
    'webHelper.rustOutdated':
      'ตัวช่วยล้าสมัยแล้ว ดาวน์โหลดและเปิดรุ่นใหม่หนึ่งครั้ง แล้วตรวจสอบอีกครั้ง',
    'webHelper.unavailable': 'ตัวช่วยเนทีฟไม่ตอบสนอง ดาวน์โหลดตัวช่วยหรือใช้ Steam เมื่อรองรับ',
    'webHelper.notNow': 'ยังไม่ตอนนี้',
    'webHelper.never': 'ไม่ต้องแสดงอีก',
    'webHelper.back': 'ย้อนกลับ',
    'webHelper.close': 'ปิดการตั้งค่า'
  },
  id: {
    'webHelper.discordJoined': 'Bergabung ke party dari Discord.',
    'webHelper.discordInviteFailed': 'Undangan party Discord ini tidak tersedia lagi.',
    'webHelper.perkLaunch': 'Buka Counter-Strike 1.3 atau 1.6 yang terpasang dari browser.',
    'webHelper.perkSettings': 'Pilih folder game dan pengaturan tampilan di perangkat ini.',
    'webHelper.perkEnhancements':
      'Gunakan peningkatan dalam game yang didukung di Counter-Strike 1.6.',
    'webHelper.perkUpdates': 'Perbarui helper native secara otomatis.',
    'webHelper.localSettings':
      'Disimpan helper native di komputer ini. Jalur instalasi tetap berada di perangkat Anda.',
    'webHelper.folder16': 'Folder instalasi Counter-Strike 1.6',
    'webHelper.choose16': 'Pilih folder 1.6',
    'webHelper.enhancements': 'Peningkatan dalam game',
    'webHelper.killCards': 'Kartu kill',
    'webHelper.invalidFolder':
      'Folder ini bukan instalasi Counter-Strike yang lengkap. Pilih folder berisi berkas executable game dan berkas cstrike. Anda dapat memilih folder lain.',
    'webHelper.settingsError':
      'Tidak dapat mengakses pengaturan helper atau memvalidasi folder. Hubungkan ulang helper dan coba lagi.',
    'webHelper.settingsLoading': 'Memuat pengaturan helper…',
    'webHelper.settingsSaving': 'Menyimpan pengaturan helper…',
    'webHelper.retry': 'Coba lagi',
    'webHelper.steamLaunchHint':
      'Tutup Counter-Strike sebelum membuka lewat Steam. Jika sudah berjalan, gunakan Salin koneksi dan tempel perintah di konsol game.',
    'webHelper.steamCredentialFallback':
      'Steam tidak dapat meneruskan kredensial pertandingan ini dengan benar. Gunakan Salin koneksi dan tempel perintah di konsol Counter-Strike.',
    'webHelper.title': 'Main dengan helper native',
    'webHelper.description':
      'Gunakan helper native kecil untuk membuka Counter-Strike 1.3 atau 1.6 yang terpasang dari browser. Steam juga tersedia untuk pertandingan 1.6 yang didukung.',
    'webHelper.check': 'Periksa peluncur',
    'webHelper.checking': 'Memeriksa helper native…',
    'webHelper.success': 'Helper berhasil disiapkan',
    'webHelper.checkDesktop': 'Periksa aplikasi desktop',
    'webHelper.checkRust': 'Periksa helper',
    'webHelper.linuxTitle': 'Jalankan helper di Linux',
    'webHelper.linuxDescription':
      'Setelah unduhan selesai, buka terminal dan jalankan perintah ini. Jika file tersimpan di tempat lain, gunakan folder tersebut sebagai ganti Downloads.',
    'webHelper.linuxAfter':
      'Jalankan perintah lengkap di bawah. Jendela ini akan menutup otomatis setelah penyiapan diverifikasi.',
    'webHelper.copyCommand': 'Salin perintah',
    'webHelper.commandCopied': 'Perintah disalin.',
    'webHelper.copyFailed': 'Tidak dapat menyalin. Coba lagi.',
    'webHelper.download': 'Unduh helper',
    'webHelper.viewSourceCode': 'Lihat Kode Sumber',
    'webHelper.update': 'Perbarui helper',
    'webHelper.electronReady': 'Aplikasi desktop siap.',
    'webHelper.rustReady': 'Helper siap.',
    'webHelper.installedVersion': 'Terpasang: {{version}}',
    'webHelper.latestVersion': 'Terbaru: {{version}}',
    'webHelper.olderVersion': 'Versi lama',
    'webHelper.updateAvailable': 'Pembaruan tersedia',
    'webHelper.upToDate': 'Sudah terbaru',
    'webHelper.versionUnavailable': 'Versi helper tidak tersedia',
    'webHelper.electronOutdated':
      'Aplikasi desktop sudah lama. Perbarui atau periksa helper di bawah.',
    'webHelper.rustOutdated':
      'Helper sudah lama. Unduh dan buka versi terbaru sekali, lalu periksa lagi.',
    'webHelper.unavailable':
      'Helper native tidak merespons. Unduh helper atau lanjutkan dengan Steam jika didukung.',
    'webHelper.notNow': 'Jangan sekarang',
    'webHelper.never': 'Jangan tampilkan lagi',
    'webHelper.back': 'Kembali',
    'webHelper.close': 'Tutup pengaturan'
  },
  pt: {
    'webHelper.discordJoined': 'Você entrou no grupo pelo Discord.',
    'webHelper.discordInviteFailed': 'O convite de grupo do Discord não está mais disponível.',
    'webHelper.perkLaunch': 'Abra o Counter-Strike 1.3 ou 1.6 instalado pelo navegador.',
    'webHelper.perkSettings': 'Escolha pastas do jogo e configurações de vídeo neste dispositivo.',
    'webHelper.perkEnhancements': 'Use melhorias compatíveis dentro do Counter-Strike 1.6.',
    'webHelper.perkUpdates': 'Mantenha o helper nativo atualizado automaticamente.',
    'webHelper.localSettings':
      'Salvo pelo helper nativo neste computador. Os caminhos de instalação ficam no seu dispositivo.',
    'webHelper.folder16': 'Pasta de instalação do Counter-Strike 1.6',
    'webHelper.choose16': 'Escolher pasta do 1.6',
    'webHelper.enhancements': 'Melhorias no jogo',
    'webHelper.killCards': 'Cartões de eliminação',
    'webHelper.invalidFolder':
      'Esta pasta não contém uma instalação completa do Counter-Strike. Escolha a pasta com o executável do jogo e os arquivos cstrike. Você pode selecionar outra pasta.',
    'webHelper.settingsError':
      'Não foi possível acessar as configurações ou validar a pasta. Reconecte o helper e tente novamente.',
    'webHelper.settingsLoading': 'Carregando configurações do helper…',
    'webHelper.settingsSaving': 'Salvando configurações do helper…',
    'webHelper.retry': 'Tentar novamente',
    'webHelper.steamLaunchHint':
      'Feche o Counter-Strike antes de iniciar pelo Steam. Se já estiver aberto, use Copiar conexão e cole o comando no console do jogo.',
    'webHelper.steamCredentialFallback':
      'O Steam não consegue transmitir corretamente as credenciais desta partida. Use Copiar conexão e cole o comando no console do Counter-Strike.',
    'webHelper.title': 'Jogue com o helper nativo',
    'webHelper.description':
      'Use o pequeno helper nativo para abrir o Counter-Strike 1.3 ou 1.6 instalado pelo navegador. Você também pode continuar com o Steam em partidas 1.6 compatíveis.',
    'webHelper.check': 'Verificar iniciador',
    'webHelper.checking': 'Verificando o helper nativo…',
    'webHelper.success': 'Helper configurado com sucesso',
    'webHelper.checkDesktop': 'Verificar aplicativo',
    'webHelper.checkRust': 'Verificar auxiliar',
    'webHelper.linuxTitle': 'Executar o auxiliar no Linux',
    'webHelper.linuxDescription':
      'Após o download, abra um terminal e execute estes comandos. Se o arquivo estiver em outra pasta, use essa pasta no lugar de Downloads.',
    'webHelper.linuxAfter':
      'Execute o comando completo abaixo. Esta janela fechará automaticamente quando a configuração for verificada.',
    'webHelper.copyCommand': 'Copiar comando',
    'webHelper.commandCopied': 'Comando copiado.',
    'webHelper.copyFailed': 'Não foi possível copiar. Tente novamente.',
    'webHelper.download': 'Baixar auxiliar',
    'webHelper.viewSourceCode': 'Ver código-fonte',
    'webHelper.update': 'Atualizar auxiliar',
    'webHelper.electronReady': 'Aplicativo pronto.',
    'webHelper.rustReady': 'Auxiliar pronto.',
    'webHelper.installedVersion': 'Instalado: {{version}}',
    'webHelper.latestVersion': 'Mais recente: {{version}}',
    'webHelper.olderVersion': 'Versão antiga',
    'webHelper.updateAvailable': 'Atualização disponível',
    'webHelper.upToDate': 'Atualizado',
    'webHelper.versionUnavailable': 'Versão do auxiliar indisponível',
    'webHelper.electronOutdated':
      'O aplicativo está desatualizado. Atualize-o ou verifique o auxiliar abaixo.',
    'webHelper.rustOutdated':
      'O auxiliar está desatualizado. Baixe e abra a versão atual uma vez, depois verifique novamente.',
    'webHelper.unavailable':
      'O helper nativo não respondeu. Baixe-o ou continue com o Steam quando disponível.',
    'webHelper.notNow': 'Agora não',
    'webHelper.never': 'Não mostrar novamente',
    'webHelper.back': 'Voltar',
    'webHelper.close': 'Fechar configuração'
  },
  ja: {
    'webHelper.discordJoined': 'Discord からパーティーに参加しました。',
    'webHelper.discordInviteFailed': 'この Discord パーティー招待は利用できなくなりました。',
    'webHelper.perkLaunch': 'インストール済みのCounter-Strike 1.3または1.6をブラウザーから起動。',
    'webHelper.perkSettings': 'この端末でゲームフォルダーと画面設定を選択。',
    'webHelper.perkEnhancements': 'Counter-Strike 1.6で対応するゲーム内拡張機能を利用。',
    'webHelper.perkUpdates': 'ネイティブヘルパーを自動更新。',
    'webHelper.localSettings':
      'ネイティブヘルパーがこのPCに保存します。インストール先のパスは端末内に保持されます。',
    'webHelper.folder16': 'Counter-Strike 1.6のインストールフォルダー',
    'webHelper.choose16': '1.6のフォルダーを選択',
    'webHelper.enhancements': 'ゲーム内の拡張機能',
    'webHelper.killCards': 'キルカード',
    'webHelper.invalidFolder':
      'このフォルダーには Counter-Strike の完全なインストールがありません。ゲームの実行ファイルと cstrike ファイルを含むフォルダーを選択してください。別のフォルダーを選択できます。',
    'webHelper.settingsError':
      'ヘルパー設定にアクセスできないか、フォルダーを確認できません。再接続して再試行してください。',
    'webHelper.settingsLoading': 'ヘルパー設定を読み込み中…',
    'webHelper.settingsSaving': 'ヘルパー設定を保存中…',
    'webHelper.retry': '再試行',
    'webHelper.steamLaunchHint':
      'Steam から起動する前に Counter-Strike を終了してください。起動済みの場合は「接続をコピー」でコピーしたコマンドをゲームのコンソールに貼り付けてください。',
    'webHelper.steamCredentialFallback':
      'Steam はこのマッチの接続情報を正しく渡せません。「接続をコピー」でコピーしたコマンドを Counter-Strike のコンソールに貼り付けてください。',
    'webHelper.title': 'ネイティブヘルパーでプレイ',
    'webHelper.description':
      '小さなネイティブヘルパーで、インストール済みのCounter-Strike 1.3または1.6をブラウザーから起動できます。対応する1.6の試合ではSteamでも続行できます。',
    'webHelper.check': 'ランチャーを確認',
    'webHelper.checking': 'ネイティブヘルパーを確認中…',
    'webHelper.success': 'ヘルパーの設定が完了しました',
    'webHelper.checkDesktop': 'デスクトップアプリを確認',
    'webHelper.checkRust': 'ヘルパーを確認',
    'webHelper.linuxTitle': 'Linux でヘルパーを実行',
    'webHelper.linuxDescription':
      'ダウンロード後、端末で次のコマンドを実行してください。別の場所に保存した場合は Downloads をそのフォルダーに変更してください。',
    'webHelper.linuxAfter':
      '以下のコマンド全体を実行してください。設定が確認されると、このウィンドウは自動的に閉じます。',
    'webHelper.copyCommand': 'コマンドをコピー',
    'webHelper.commandCopied': 'コマンドをコピーしました。',
    'webHelper.copyFailed': 'コピーできませんでした。もう一度お試しください。',
    'webHelper.download': 'ヘルパーをダウンロード',
    'webHelper.viewSourceCode': 'ソースコードを見る',
    'webHelper.update': 'ヘルパーを更新',
    'webHelper.electronReady': 'デスクトップアプリを利用できます。',
    'webHelper.rustReady': 'ヘルパーを利用できます。',
    'webHelper.installedVersion': 'インストール済み: {{version}}',
    'webHelper.latestVersion': '最新版: {{version}}',
    'webHelper.olderVersion': '古いバージョン',
    'webHelper.updateAvailable': '更新できます',
    'webHelper.upToDate': '最新です',
    'webHelper.versionUnavailable': 'ヘルパーのバージョンを確認できません',
    'webHelper.electronOutdated':
      'デスクトップアプリが古いです。更新するか、下のヘルパーを確認してください。',
    'webHelper.rustOutdated':
      'ヘルパーが古いです。最新版をダウンロードして一度開き、再確認してください。',
    'webHelper.unavailable':
      'ネイティブヘルパーから応答がありません。ダウンロードするか、対応している場合はSteamで続行してください。',
    'webHelper.notNow': '今はしない',
    'webHelper.never': '今後表示しない',
    'webHelper.back': '戻る',
    'webHelper.close': '設定を閉じる'
  },
  hi: {
    'webHelper.discordJoined': 'Discord से पार्टी में शामिल हुए।',
    'webHelper.discordInviteFailed': 'Discord पार्टी का निमंत्रण अब उपलब्ध नहीं है।',
    'webHelper.perkLaunch': 'ब्राउज़र से इंस्टॉल किए गए Counter-Strike 1.3 या 1.6 को खोलें।',
    'webHelper.perkSettings': 'इस डिवाइस पर गेम फ़ोल्डर और डिस्प्ले सेटिंग चुनें।',
    'webHelper.perkEnhancements': 'Counter-Strike 1.6 में समर्थित गेम सुधारों का उपयोग करें।',
    'webHelper.perkUpdates': 'नेटिव हेल्पर को अपने आप अपडेट रखें।',
    'webHelper.localSettings':
      'नेटिव हेल्पर इस कंप्यूटर पर सेटिंग सहेजता है। इंस्टॉलेशन पथ आपके डिवाइस पर रहते हैं।',
    'webHelper.folder16': 'Counter-Strike 1.6 इंस्टॉलेशन फ़ोल्डर',
    'webHelper.choose16': '1.6 फ़ोल्डर चुनें',
    'webHelper.enhancements': 'गेम के अंदर सुधार',
    'webHelper.killCards': 'किल कार्ड',
    'webHelper.invalidFolder':
      'इस फ़ोल्डर में Counter-Strike की पूरी स्थापना नहीं है। गेम की निष्पादन योग्य फ़ाइल और cstrike फ़ाइलों वाला फ़ोल्डर चुनें। आप दूसरा फ़ोल्डर चुन सकते हैं।',
    'webHelper.settingsError':
      'हेल्पर सेटिंग नहीं खुलीं या फ़ोल्डर अमान्य है। हेल्पर दोबारा कनेक्ट करके प्रयास करें।',
    'webHelper.settingsLoading': 'हेल्पर सेटिंग लोड हो रही हैं…',
    'webHelper.settingsSaving': 'हेल्पर सेटिंग सहेजी जा रही हैं…',
    'webHelper.retry': 'फिर कोशिश करें',
    'webHelper.steamLaunchHint':
      'Steam से शुरू करने से पहले Counter-Strike बंद करें। यदि गेम पहले से चल रहा है, तो कनेक्शन कॉपी करें और कमांड को गेम कंसोल में पेस्ट करें।',
    'webHelper.steamCredentialFallback':
      'Steam इस मैच के कनेक्शन विवरण सही तरह से नहीं भेज सकता। कनेक्शन कॉपी करें और कमांड को Counter-Strike कंसोल में पेस्ट करें।',
    'webHelper.title': 'नेटिव हेल्पर से खेलें',
    'webHelper.description':
      'ब्राउज़र से इंस्टॉल किए गए Counter-Strike 1.3 या 1.6 को खोलने के लिए छोटे नेटिव हेल्पर का उपयोग करें। समर्थित 1.6 मैचों के लिए Steam भी उपलब्ध है।',
    'webHelper.check': 'लॉन्चर जाँचें',
    'webHelper.checking': 'नेटिव हेल्पर की जाँच हो रही है…',
    'webHelper.success': 'हेल्पर सफलतापूर्वक सेट हो गया',
    'webHelper.checkDesktop': 'डेस्कटॉप ऐप जाँचें',
    'webHelper.checkRust': 'हेल्पर जाँचें',
    'webHelper.linuxTitle': 'Linux पर हेल्पर चलाएँ',
    'webHelper.linuxDescription':
      'डाउनलोड के बाद टर्मिनल खोलकर ये कमांड चलाएँ। फ़ाइल कहीं और सहेजी हो तो Downloads की जगह उस फ़ोल्डर का उपयोग करें।',
    'webHelper.linuxAfter':
      'नीचे दी गई पूरी कमांड चलाएँ। सेटअप सत्यापित होने पर यह विंडो अपने आप बंद हो जाएगी।',
    'webHelper.copyCommand': 'कमांड कॉपी करें',
    'webHelper.commandCopied': 'कमांड कॉपी हो गई।',
    'webHelper.copyFailed': 'कॉपी नहीं हो सकी। फिर से कोशिश करें।',
    'webHelper.download': 'हेल्पर डाउनलोड करें',
    'webHelper.viewSourceCode': 'सोर्स कोड देखें',
    'webHelper.update': 'हेल्पर अपडेट करें',
    'webHelper.electronReady': 'डेस्कटॉप ऐप तैयार है।',
    'webHelper.rustReady': 'हेल्पर तैयार है।',
    'webHelper.installedVersion': 'इंस्टॉल: {{version}}',
    'webHelper.latestVersion': 'नवीनतम: {{version}}',
    'webHelper.olderVersion': 'पुराना संस्करण',
    'webHelper.updateAvailable': 'अपडेट उपलब्ध है',
    'webHelper.upToDate': 'नवीनतम संस्करण',
    'webHelper.versionUnavailable': 'हेल्पर संस्करण उपलब्ध नहीं है',
    'webHelper.electronOutdated': 'डेस्कटॉप ऐप पुराना है। इसे अपडेट करें या नीचे हेल्पर जाँचें।',
    'webHelper.rustOutdated':
      'हेल्पर पुराना है। नया संस्करण डाउनलोड करके एक बार खोलें, फिर दोबारा जाँचें।',
    'webHelper.unavailable':
      'नेटिव हेल्पर ने जवाब नहीं दिया। इसे डाउनलोड करें या जहाँ समर्थित हो वहाँ Steam से जारी रखें।',
    'webHelper.notNow': 'अभी नहीं',
    'webHelper.never': 'फिर कभी न दिखाएँ',
    'webHelper.back': 'वापस',
    'webHelper.close': 'सेटअप बंद करें'
  }
}
