import type { SupportedLanguageCode } from './i18n'

const en = {
  'legacy.customNoMaps': 'No maps configured',
  'legacy.launchWine': 'Open 1.3 with Wine',
  'legacy.wineRuntime':
    'This installation has a Windows game client, so Linux launches it through Wine. The native Linux server library does not provide a native game client.',
  'legacy.download': 'Get 1.3 on ModDB',
  'legacy.downloadHelp':
    'The ModDB download is the 1.3 mod for Half-Life Retail. Install it into a compatible Half-Life installation, then select that folder. On Linux, Windows installations require Wine.',
  'legacy.error.downloadFailed': 'Could not open ModDB. Try the download button again.',
  'legacy.modeHelp':
    'Counter-Strike 1.3 · 3v3 · MR12: 12 rounds per half, first to 13. Requires a separate 1.3 installation.',
  'legacy.queueUnavailable':
    '1.3 3v3 matchmaking is not ready yet. You can set up your 1.3 folder in Settings now.',
  'legacy.onboardingTitle': 'Want to play Counter-Strike 1.3?',
  'legacy.onboardingDescription':
    '1.3 3v3 uses a separate installation and MR12 rules. Set it up now or add it later in Settings.',
  'legacy.yes': 'Yes, set up 1.3',
  'legacy.yesHelp': 'Choose your 1.3 installation folder.',
  'legacy.no': 'Not now',
  'legacy.noHelp': 'You can add 1.3 later in Settings.',
  'legacy.continue': 'Continue',
  'legacy.skip': 'Skip 1.3 setup for now',
  'legacy.title': 'Counter-Strike 1.3',
  'legacy.description':
    'Experimental support for a separate 1.3 installation. Open the game menu to try it. Matchmaking and in-game enhancements are not available for 1.3 yet; current Legacy matches still use 1.6.',
  'legacy.folder': 'Counter-Strike 1.3 installation folder',
  'legacy.empty': 'No 1.3 folder selected',
  'legacy.choose': 'Choose 1.3 folder',
  'legacy.launch': 'Open 1.3 game menu',
  'legacy.launched':
    'Game process started. If the menu does not open, check that this installation runs normally.',
  'legacy.error.unsupportedPlatform':
    'This platform is not supported. Use the Windows or Linux desktop launcher.',
  'legacy.error.invalidInstallation':
    'The folder could not be validated as 1.3. Choose a separate installation with 1.3 version metadata, the game executable and client library. Linux supports native hl_linux or Windows hl.exe through Wine.',
  'legacy.error.installationRequired': 'Choose your Counter-Strike 1.3 folder first.',
  'legacy.error.busy':
    'Finish or leave matchmaking before opening 1.3. If another action is running, wait and try again.',
  'legacy.error.launchFailed':
    'Could not start 1.3. Check that the selected installation runs normally, then try again.',
  'legacy.error.settingsFailed':
    'Could not load or save the 1.3 folder. Choose it again and check launcher storage permissions.'
} as const

export const legacyGameTranslations: Record<
  SupportedLanguageCode,
  Record<keyof typeof en, string>
> = {
  en,
  ru: {
    'legacy.customNoMaps': 'Карты не настроены',
    'legacy.launchWine': 'Открыть 1.3 через Wine',
    'legacy.wineRuntime':
      'В этой установке клиент игры предназначен для Windows, поэтому в Linux он запускается через Wine. Нативная библиотека Linux-сервера не является клиентом игры.',
    'legacy.download': 'Скачать 1.3 на ModDB',
    'legacy.downloadHelp':
      'На ModDB размещён мод 1.3 для Half-Life Retail. Установите его в совместимую Half-Life и выберите эту папку. В Linux для Windows-версии нужен Wine.',
    'legacy.error.downloadFailed': 'Не удалось открыть ModDB. Нажмите кнопку скачивания ещё раз.',
    'legacy.modeHelp':
      'Counter-Strike 1.3 · 3v3 · MR12: 12 раундов за половину, победа при 13. Нужна отдельная установка 1.3.',
    'legacy.queueUnavailable':
      'Подбор матчей 1.3 3v3 пока не готов. Папку 1.3 уже можно выбрать в настройках.',
    'legacy.onboardingTitle': 'Хотите играть в Counter-Strike 1.3?',
    'legacy.onboardingDescription':
      'Для 1.3 3v3 нужна отдельная установка; используются правила MR12. Настройте сейчас или позже в настройках.',
    'legacy.yes': 'Да, настроить 1.3',
    'legacy.yesHelp': 'Выберите папку установки 1.3.',
    'legacy.no': 'Не сейчас',
    'legacy.noHelp': '1.3 можно добавить позже в настройках.',
    'legacy.continue': 'Продолжить',
    'legacy.skip': 'Пропустить настройку 1.3',
    'legacy.title': 'Counter-Strike 1.3',
    'legacy.description':
      'Экспериментальная поддержка отдельной установки 1.3. Откройте меню игры для проверки. Подбор матчей и игровые улучшения для 1.3 пока недоступны; текущие матчи Legacy по-прежнему используют 1.6.',
    'legacy.folder': 'Папка установки Counter-Strike 1.3',
    'legacy.empty': 'Папка 1.3 не выбрана',
    'legacy.choose': 'Выбрать папку 1.3',
    'legacy.launch': 'Открыть меню игры 1.3',
    'legacy.launched':
      'Процесс игры запущен. Если меню не открылось, проверьте обычный запуск этой установки.',
    'legacy.error.unsupportedPlatform':
      'Платформа не поддерживается. Используйте настольный лаунчер для Windows или Linux.',
    'legacy.error.invalidInstallation':
      'Не удалось подтвердить версию 1.3. Выберите отдельную установку с метаданными версии 1.3, исполняемым файлом и клиентской библиотекой. В Linux поддерживается hl_linux или Windows hl.exe через Wine.',
    'legacy.error.installationRequired': 'Сначала выберите папку Counter-Strike 1.3.',
    'legacy.error.busy':
      'Завершите матч или выйдите из подбора перед запуском 1.3. Если выполняется другое действие, подождите и повторите попытку.',
    'legacy.error.launchFailed':
      'Не удалось запустить 1.3. Проверьте обычный запуск выбранной установки и повторите попытку.',
    'legacy.error.settingsFailed':
      'Не удалось загрузить или сохранить папку 1.3. Выберите её снова и проверьте права на хранилище лаунчера.'
  },
  tl: {
    'legacy.customNoMaps': 'Walang naka-set na mapa',
    'legacy.launchWine': 'Buksan ang 1.3 sa Wine',
    'legacy.wineRuntime':
      'Windows game client ang nasa installation na ito, kaya Wine ang gamit sa Linux. Ang native Linux server library ay hindi native game client.',
    'legacy.download': 'Kunin ang 1.3 sa ModDB',
    'legacy.downloadHelp':
      'Ang ModDB download ay 1.3 mod para sa Half-Life Retail. I-install sa compatible na Half-Life, tapos piliin ang folder. Kailangan ng Wine sa Linux para sa Windows installation.',
    'legacy.error.downloadFailed': 'Hindi mabuksan ang ModDB. Pindutin ulit ang download button.',
    'legacy.modeHelp':
      'Counter-Strike 1.3 · 3v3 · MR12: 12 rounds kada half, unang maka-13. Kailangan ng hiwalay na 1.3 installation.',
    'legacy.queueUnavailable':
      'Hindi pa handa ang 1.3 3v3 matchmaking. Maaari mo nang piliin ang 1.3 folder sa Settings.',
    'legacy.onboardingTitle': 'Gusto mong maglaro ng Counter-Strike 1.3?',
    'legacy.onboardingDescription':
      'Hiwalay na installation at MR12 rules ang gamit ng 1.3 3v3. I-set up ngayon o idagdag sa Settings mamaya.',
    'legacy.yes': 'Oo, i-set up ang 1.3',
    'legacy.yesHelp': 'Piliin ang 1.3 installation folder mo.',
    'legacy.no': 'Hindi muna',
    'legacy.noHelp': 'Maaari mong idagdag ang 1.3 sa Settings mamaya.',
    'legacy.continue': 'Magpatuloy',
    'legacy.skip': 'Laktawan muna ang 1.3 setup',
    'legacy.title': 'Counter-Strike 1.3',
    'legacy.description':
      'Experimental na suporta para sa hiwalay na 1.3 installation. Buksan ang game menu para subukan. Wala pang matchmaking at in-game enhancements para sa 1.3; 1.6 pa rin ang gamit ng kasalukuyang Legacy matches.',
    'legacy.folder': 'Installation folder ng Counter-Strike 1.3',
    'legacy.empty': 'Walang napiling 1.3 folder',
    'legacy.choose': 'Pumili ng 1.3 folder',
    'legacy.launch': 'Buksan ang 1.3 menu',
    'legacy.launched':
      'Nagsimula na ang game process. Kung hindi bumukas ang menu, tingnan kung normal na tumatakbo ang installation.',
    'legacy.error.unsupportedPlatform':
      'Hindi suportado ang platform na ito. Gamitin ang desktop launcher sa Windows o Linux.',
    'legacy.error.invalidInstallation':
      'Hindi ma-validate ang folder bilang 1.3. Pumili ng hiwalay na installation na may 1.3 version metadata, game executable, at client library. Sa Linux, puwedeng hl_linux o Windows hl.exe gamit ang Wine.',
    'legacy.error.installationRequired': 'Piliin muna ang Counter-Strike 1.3 folder mo.',
    'legacy.error.busy':
      'Tapusin ang match o umalis sa matchmaking bago buksan ang 1.3. Kung may ibang ginagawa, maghintay at subukan ulit.',
    'legacy.error.launchFailed':
      'Hindi ma-start ang 1.3. Tingnan kung normal na tumatakbo ang napiling installation, tapos subukan ulit.',
    'legacy.error.settingsFailed':
      'Hindi ma-load o ma-save ang 1.3 folder. Piliin ulit ito at tingnan ang storage permissions ng launcher.'
  },
  th: {
    'legacy.customNoMaps': 'ยังไม่ได้กำหนดแผนที่',
    'legacy.launchWine': 'เปิด 1.3 ผ่าน Wine',
    'legacy.wineRuntime':
      'การติดตั้งนี้มีไคลเอนต์เกมแบบ Windows จึงใช้ Wine บน Linux ไลบรารีเซิร์ฟเวอร์ Linux แบบเนทีฟไม่ใช่ไคลเอนต์เกมแบบเนทีฟ',
    'legacy.download': 'รับ 1.3 บน ModDB',
    'legacy.downloadHelp':
      'ไฟล์จาก ModDB เป็นม็อด 1.3 สำหรับ Half-Life Retail ติดตั้งใน Half-Life ที่เข้ากันได้แล้วเลือกโฟลเดอร์นั้น บน Linux การติดตั้งแบบ Windows ต้องใช้ Wine',
    'legacy.error.downloadFailed': 'เปิด ModDB ไม่ได้ โปรดลองกดปุ่มดาวน์โหลดอีกครั้ง',
    'legacy.modeHelp':
      'Counter-Strike 1.3 · 3v3 · MR12: ครึ่งละ 12 รอบ ชนะเมื่อถึง 13 รอบ ต้องติดตั้ง 1.3 แยกต่างหาก',
    'legacy.queueUnavailable':
      'ระบบจับคู่ 1.3 3v3 ยังไม่พร้อม คุณสามารถตั้งค่าโฟลเดอร์ 1.3 ในการตั้งค่าได้แล้ว',
    'legacy.onboardingTitle': 'ต้องการเล่น Counter-Strike 1.3 หรือไม่?',
    'legacy.onboardingDescription':
      '1.3 3v3 ใช้การติดตั้งแยกและกติกา MR12 ตั้งค่าตอนนี้หรือเพิ่มภายหลังในการตั้งค่า',
    'legacy.yes': 'ใช่ ตั้งค่า 1.3',
    'legacy.yesHelp': 'เลือกโฟลเดอร์ติดตั้ง 1.3',
    'legacy.no': 'ยังไม่ใช่ตอนนี้',
    'legacy.noHelp': 'คุณสามารถเพิ่ม 1.3 ภายหลังในการตั้งค่า',
    'legacy.continue': 'ดำเนินการต่อ',
    'legacy.skip': 'ข้ามการตั้งค่า 1.3 ไปก่อน',
    'legacy.title': 'Counter-Strike 1.3',
    'legacy.description':
      'รองรับการติดตั้ง 1.3 แยกต่างหากในขั้นทดลอง เปิดเมนูเกมเพื่อทดสอบ ยังไม่มีระบบจับคู่และส่วนเสริมในเกมสำหรับ 1.3 ส่วนแมตช์ Legacy ปัจจุบันยังใช้ 1.6',
    'legacy.folder': 'โฟลเดอร์ติดตั้ง Counter-Strike 1.3',
    'legacy.empty': 'ยังไม่ได้เลือกโฟลเดอร์ 1.3',
    'legacy.choose': 'เลือกโฟลเดอร์ 1.3',
    'legacy.launch': 'เปิดเมนูเกม 1.3',
    'legacy.launched':
      'เริ่มกระบวนการเกมแล้ว หากเมนูไม่เปิด ให้ตรวจสอบว่าเกมที่ติดตั้งนี้เปิดตามปกติได้',
    'legacy.error.unsupportedPlatform':
      'ไม่รองรับแพลตฟอร์มนี้ โปรดใช้ตัวเปิดเกมเดสก์ท็อปบน Windows หรือ Linux',
    'legacy.error.invalidInstallation':
      'ยืนยันโฟลเดอร์ว่าเป็น 1.3 ไม่ได้ เลือกการติดตั้งแยกที่มีข้อมูลเวอร์ชัน 1.3 ไฟล์เรียกใช้เกม และไลบรารีไคลเอนต์ บน Linux ใช้ hl_linux หรือ hl.exe แบบ Windows ผ่าน Wine ได้',
    'legacy.error.installationRequired': 'เลือกโฟลเดอร์ Counter-Strike 1.3 ก่อน',
    'legacy.error.busy':
      'จบแมตช์หรือออกจากการจับคู่ก่อนเปิด 1.3 หากกำลังทำงานอื่นอยู่ ให้รอแล้วลองอีกครั้ง',
    'legacy.error.launchFailed':
      'เริ่ม 1.3 ไม่ได้ ตรวจสอบว่าการติดตั้งที่เลือกเปิดตามปกติได้ แล้วลองอีกครั้ง',
    'legacy.error.settingsFailed':
      'โหลดหรือบันทึกโฟลเดอร์ 1.3 ไม่ได้ เลือกอีกครั้งและตรวจสอบสิทธิ์พื้นที่จัดเก็บของตัวเปิดเกม'
  },
  id: {
    'legacy.customNoMaps': 'Belum ada peta',
    'legacy.launchWine': 'Buka 1.3 dengan Wine',
    'legacy.wineRuntime':
      'Instalasi ini berisi klien game Windows, jadi Linux menjalankannya melalui Wine. Pustaka server Linux native bukan klien game native.',
    'legacy.download': 'Dapatkan 1.3 di ModDB',
    'legacy.downloadHelp':
      'Unduhan ModDB adalah mod 1.3 untuk Half-Life Retail. Pasang pada Half-Life yang kompatibel, lalu pilih foldernya. Instalasi Windows di Linux memerlukan Wine.',
    'legacy.error.downloadFailed': 'Tidak dapat membuka ModDB. Coba tombol unduh lagi.',
    'legacy.modeHelp':
      'Counter-Strike 1.3 · 3v3 · MR12: 12 ronde per babak, pertama mencapai 13. Memerlukan instalasi 1.3 terpisah.',
    'legacy.queueUnavailable':
      'Matchmaking 1.3 3v3 belum siap. Anda dapat menyiapkan folder 1.3 di Pengaturan sekarang.',
    'legacy.onboardingTitle': 'Ingin bermain Counter-Strike 1.3?',
    'legacy.onboardingDescription':
      '1.3 3v3 memakai instalasi terpisah dan aturan MR12. Siapkan sekarang atau tambahkan nanti di Pengaturan.',
    'legacy.yes': 'Ya, siapkan 1.3',
    'legacy.yesHelp': 'Pilih folder instalasi 1.3 Anda.',
    'legacy.no': 'Tidak sekarang',
    'legacy.noHelp': 'Anda dapat menambahkan 1.3 nanti di Pengaturan.',
    'legacy.continue': 'Lanjutkan',
    'legacy.skip': 'Lewati pengaturan 1.3 untuk sekarang',
    'legacy.title': 'Counter-Strike 1.3',
    'legacy.description':
      'Dukungan eksperimental untuk instalasi 1.3 terpisah. Buka menu game untuk mencobanya. Matchmaking dan peningkatan dalam game belum tersedia untuk 1.3; pertandingan Legacy saat ini masih menggunakan 1.6.',
    'legacy.folder': 'Folder instalasi Counter-Strike 1.3',
    'legacy.empty': 'Belum ada folder 1.3 yang dipilih',
    'legacy.choose': 'Pilih folder 1.3',
    'legacy.launch': 'Buka menu game 1.3',
    'legacy.launched':
      'Proses game dimulai. Jika menu tidak terbuka, periksa apakah instalasi ini dapat dijalankan secara normal.',
    'legacy.error.unsupportedPlatform':
      'Platform ini tidak didukung. Gunakan launcher desktop Windows atau Linux.',
    'legacy.error.invalidInstallation':
      'Folder tidak dapat divalidasi sebagai 1.3. Pilih instalasi terpisah dengan metadata versi 1.3, executable game, dan pustaka klien. Linux mendukung hl_linux atau hl.exe Windows melalui Wine.',
    'legacy.error.installationRequired': 'Pilih folder Counter-Strike 1.3 terlebih dahulu.',
    'legacy.error.busy':
      'Selesaikan pertandingan atau keluar dari matchmaking sebelum membuka 1.3. Jika tindakan lain sedang berjalan, tunggu dan coba lagi.',
    'legacy.error.launchFailed':
      'Tidak dapat memulai 1.3. Pastikan instalasi yang dipilih dapat berjalan normal, lalu coba lagi.',
    'legacy.error.settingsFailed':
      'Tidak dapat memuat atau menyimpan folder 1.3. Pilih lagi dan periksa izin penyimpanan launcher.'
  },
  hi: {
    'legacy.customNoMaps': 'कोई मैप कॉन्फ़िगर नहीं है',
    'legacy.launchWine': 'Wine से 1.3 खोलें',
    'legacy.wineRuntime':
      'इस इंस्टॉलेशन में Windows गेम क्लाइंट है, इसलिए Linux पर यह Wine से चलता है। नेटिव Linux सर्वर लाइब्रेरी नेटिव गेम क्लाइंट नहीं है।',
    'legacy.download': 'ModDB से 1.3 प्राप्त करें',
    'legacy.downloadHelp':
      'ModDB डाउनलोड Half-Life Retail के लिए 1.3 मॉड है। इसे संगत Half-Life इंस्टॉलेशन में इंस्टॉल करके वह फ़ोल्डर चुनें। Linux पर Windows इंस्टॉलेशन के लिए Wine चाहिए।',
    'legacy.error.downloadFailed': 'ModDB नहीं खुल सका। डाउनलोड बटन फिर दबाएँ।',
    'legacy.modeHelp':
      'Counter-Strike 1.3 · 3v3 · MR12: हर हाफ में 12 राउंड, पहले 13 जीतने वाली टीम विजेता। अलग 1.3 इंस्टॉलेशन चाहिए।',
    'legacy.queueUnavailable':
      '1.3 3v3 मैचमेकिंग अभी तैयार नहीं है। अभी सेटिंग्स में 1.3 फ़ोल्डर चुन सकते हैं।',
    'legacy.onboardingTitle': 'क्या आप Counter-Strike 1.3 खेलना चाहते हैं?',
    'legacy.onboardingDescription':
      '1.3 3v3 अलग इंस्टॉलेशन और MR12 नियम इस्तेमाल करता है। अभी सेटअप करें या बाद में सेटिंग्स में जोड़ें।',
    'legacy.yes': 'हाँ, 1.3 सेटअप करें',
    'legacy.yesHelp': 'अपना 1.3 इंस्टॉलेशन फ़ोल्डर चुनें।',
    'legacy.no': 'अभी नहीं',
    'legacy.noHelp': 'बाद में सेटिंग्स में 1.3 जोड़ सकते हैं।',
    'legacy.continue': 'जारी रखें',
    'legacy.skip': 'अभी 1.3 सेटअप छोड़ें',
    'legacy.title': 'Counter-Strike 1.3',
    'legacy.description':
      'अलग 1.3 इंस्टॉलेशन के लिए प्रयोगात्मक समर्थन। आज़माने के लिए गेम मेनू खोलें। 1.3 के लिए मैचमेकिंग और इन-गेम सुविधाएँ अभी उपलब्ध नहीं हैं; मौजूदा Legacy मैच अब भी 1.6 का उपयोग करते हैं।',
    'legacy.folder': 'Counter-Strike 1.3 इंस्टॉलेशन फ़ोल्डर',
    'legacy.empty': 'कोई 1.3 फ़ोल्डर नहीं चुना गया',
    'legacy.choose': '1.3 फ़ोल्डर चुनें',
    'legacy.launch': '1.3 गेम मेनू खोलें',
    'legacy.launched':
      'गेम प्रक्रिया शुरू हो गई। मेनू न खुले तो जाँचें कि यह इंस्टॉलेशन सामान्य रूप से चलता है।',
    'legacy.error.unsupportedPlatform':
      'यह प्लेटफ़ॉर्म समर्थित नहीं है। Windows या Linux डेस्कटॉप लॉन्चर इस्तेमाल करें।',
    'legacy.error.invalidInstallation':
      'फ़ोल्डर की 1.3 के रूप में पुष्टि नहीं हुई। 1.3 संस्करण मेटाडेटा, गेम एक्ज़ीक्यूटेबल और क्लाइंट लाइब्रेरी वाला अलग इंस्टॉलेशन चुनें। Linux पर hl_linux या Wine के ज़रिए Windows hl.exe चल सकता है।',
    'legacy.error.installationRequired': 'पहले अपना Counter-Strike 1.3 फ़ोल्डर चुनें।',
    'legacy.error.busy':
      '1.3 खोलने से पहले मैच पूरा करें या मैचमेकिंग छोड़ें। कोई अन्य काम चल रहा हो तो रुककर फिर कोशिश करें।',
    'legacy.error.launchFailed':
      '1.3 शुरू नहीं हो सका। जाँचें कि चुना गया इंस्टॉलेशन सामान्य रूप से चलता है, फिर कोशिश करें।',
    'legacy.error.settingsFailed':
      '1.3 फ़ोल्डर लोड या सहेजा नहीं जा सका। दोबारा चुनें और लॉन्चर स्टोरेज की अनुमतियाँ जाँचें।'
  },
  pt: {
    'legacy.customNoMaps': 'Nenhum mapa configurado',
    'legacy.launchWine': 'Abrir 1.3 com Wine',
    'legacy.wineRuntime':
      'Esta instalação contém o cliente Windows, então o Linux o executa pelo Wine. A biblioteca nativa do servidor Linux não fornece um cliente nativo do jogo.',
    'legacy.download': 'Obter 1.3 no ModDB',
    'legacy.downloadHelp':
      'O download do ModDB é o mod 1.3 para Half-Life Retail. Instale em um Half-Life compatível e selecione a pasta. Instalações Windows no Linux exigem Wine.',
    'legacy.error.downloadFailed':
      'Não foi possível abrir o ModDB. Tente o botão de download novamente.',
    'legacy.modeHelp':
      'Counter-Strike 1.3 · 3v3 · MR12: 12 rounds por metade, primeiro a 13. Exige instalação separada do 1.3.',
    'legacy.queueUnavailable':
      'O matchmaking 1.3 3v3 ainda não está pronto. Você já pode configurar a pasta do 1.3 nas Configurações.',
    'legacy.onboardingTitle': 'Quer jogar Counter-Strike 1.3?',
    'legacy.onboardingDescription':
      '1.3 3v3 usa uma instalação separada e regras MR12. Configure agora ou adicione depois nas Configurações.',
    'legacy.yes': 'Sim, configurar 1.3',
    'legacy.yesHelp': 'Escolha a pasta de instalação do 1.3.',
    'legacy.no': 'Agora não',
    'legacy.noHelp': 'Você pode adicionar o 1.3 depois nas Configurações.',
    'legacy.continue': 'Continuar',
    'legacy.skip': 'Pular configuração do 1.3 por enquanto',
    'legacy.title': 'Counter-Strike 1.3',
    'legacy.description':
      'Suporte experimental para uma instalação separada do 1.3. Abra o menu do jogo para testar. O matchmaking e as melhorias no jogo ainda não estão disponíveis para o 1.3; as partidas Legacy atuais continuam usando o 1.6.',
    'legacy.folder': 'Pasta de instalação do Counter-Strike 1.3',
    'legacy.empty': 'Nenhuma pasta do 1.3 selecionada',
    'legacy.choose': 'Escolher pasta do 1.3',
    'legacy.launch': 'Abrir menu do 1.3',
    'legacy.launched':
      'Processo do jogo iniciado. Se o menu não abrir, verifique se esta instalação funciona normalmente.',
    'legacy.error.unsupportedPlatform':
      'Esta plataforma não é compatível. Use o launcher para Windows ou Linux.',
    'legacy.error.invalidInstallation':
      'Não foi possível validar a pasta como 1.3. Escolha uma instalação separada com metadados da versão 1.3, executável do jogo e biblioteca do cliente. No Linux, use hl_linux ou hl.exe do Windows via Wine.',
    'legacy.error.installationRequired': 'Escolha primeiro a pasta do Counter-Strike 1.3.',
    'legacy.error.busy':
      'Termine a partida ou saia do matchmaking antes de abrir o 1.3. Se outra ação estiver em andamento, aguarde e tente novamente.',
    'legacy.error.launchFailed':
      'Não foi possível iniciar o 1.3. Verifique se a instalação selecionada funciona normalmente e tente novamente.',
    'legacy.error.settingsFailed':
      'Não foi possível carregar ou salvar a pasta do 1.3. Escolha novamente e verifique as permissões de armazenamento do launcher.'
  },
  ja: {
    'legacy.customNoMaps': 'マップ未設定',
    'legacy.launchWine': 'Wineで1.3を開く',
    'legacy.wineRuntime':
      'このインストールにはWindows版ゲームクライアントがあるため、LinuxではWine経由で起動します。ネイティブLinuxサーバー用ライブラリは、ネイティブゲームクライアントではありません。',
    'legacy.download': 'ModDBで1.3を入手',
    'legacy.downloadHelp':
      'ModDBの配布ファイルはHalf-Life Retail用の1.3 MODです。対応するHalf-Lifeにインストールして、そのフォルダーを選択してください。LinuxでWindows版を使うにはWineが必要です。',
    'legacy.error.downloadFailed':
      'ModDBを開けませんでした。ダウンロードボタンをもう一度押してください。',
    'legacy.modeHelp':
      'Counter-Strike 1.3 · 3v3 · MR12：前後半各12ラウンド、先に13勝で勝利。別途1.3のインストールが必要です。',
    'legacy.queueUnavailable':
      '1.3 3v3のマッチメイキングはまだ準備中です。設定で1.3のフォルダーを指定できます。',
    'legacy.onboardingTitle': 'Counter-Strike 1.3もプレイしますか？',
    'legacy.onboardingDescription':
      '1.3 3v3は別のインストールとMR12ルールを使用します。今設定するか、後で設定画面から追加できます。',
    'legacy.yes': 'はい、1.3を設定',
    'legacy.yesHelp': '1.3のインストールフォルダーを選択します。',
    'legacy.no': '今は設定しない',
    'legacy.noHelp': '後で設定から1.3を追加できます。',
    'legacy.continue': '続ける',
    'legacy.skip': '今は1.3の設定をスキップ',
    'legacy.title': 'Counter-Strike 1.3',
    'legacy.description':
      '別途インストールした1.3を試験的にサポートします。ゲームメニューを開いてお試しください。1.3のマッチメイキングとゲーム内拡張機能はまだ利用できません。現在のLegacyマッチは引き続き1.6を使用します。',
    'legacy.folder': 'Counter-Strike 1.3のインストールフォルダー',
    'legacy.empty': '1.3のフォルダーが未選択です',
    'legacy.choose': '1.3のフォルダーを選択',
    'legacy.launch': '1.3のメニューを開く',
    'legacy.launched':
      'ゲームのプロセスを起動しました。メニューが開かない場合は、このインストールで通常どおり起動できるか確認してください。',
    'legacy.error.unsupportedPlatform':
      'このプラットフォームには対応していません。WindowsまたはLinuxのデスクトップランチャーを使用してください。',
    'legacy.error.invalidInstallation':
      'フォルダーを1.3として確認できませんでした。1.3のバージョン情報、ゲーム実行ファイル、クライアントライブラリを含む別のインストールを選択してください。Linuxではhl_linux、またはWine経由のWindows版hl.exeを使用できます。',
    'legacy.error.installationRequired': '先にCounter-Strike 1.3のフォルダーを選択してください。',
    'legacy.error.busy':
      '1.3を開く前にマッチを終了するか、マッチメイキングから退出してください。他の操作中の場合は、しばらく待って再試行してください。',
    'legacy.error.launchFailed':
      '1.3を起動できませんでした。選択したインストールで通常どおり起動できるか確認して再試行してください。',
    'legacy.error.settingsFailed':
      '1.3のフォルダーを読み込みまたは保存できませんでした。もう一度選択し、ランチャーの保存先の権限を確認してください。'
  }
}
