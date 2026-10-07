import type { SupportedLanguageCode } from './i18n'

// Settings and Web Play copy missing from the original runtime catalogs.
const catalogs: Partial<Record<SupportedLanguageCode, Record<string, string>>> = {
  ru: {
    '1.6 Competitive by Papamo reserves this mode for desktop players. Everyone in your party must use the desktop client before the leader can queue.':
      '1.6 Competitive от Papamo предназначен для игроков на настольных компьютерах. Все в вашей группе должны использовать настольный клиент, прежде чем лидер сможет встать в очередь.',
    '1.6 Competitive settings': 'Настройки 1.6 Competitive',
    'Animated kill cards': 'Анимированные карты убийств',
    'Apply code': 'Применить код',
    'Applying referral code…': 'Применение реферального кода…',
    'Assets & previews': 'Ресурсы и превью',
    'Back to website': 'Вернуться на сайт',
    'Browser matches launch the Steam copy of Counter-Strike directly. You do not need to choose a local game folder or install launcher-managed files.':
      'Матчи из браузера запускают Steam-версию Counter-Strike напрямую. Выбирать локальную папку игры или устанавливать файлы лаунчера не нужно.',
    'By accepting, you commit to this match. Leaving after acceptance may result in a penalty. Please ensure you are ready to play before continuing.':
      'Принимая, вы соглашаетесь на этот матч. Уход после принятия может повлечь за собой штраф. Прежде чем продолжить, убедитесь, что вы готовы к игре.',
    'CS2 / CSGO crosshair code': 'Код перекрестия CS2 / CSGO',
    'CS2 pixel sizes scale with the game resolution. Dynamic spread uses GoldSrc movement and shots. Follow recoil is saved in the share code but is not yet drawn in game.':
      'Размеры пикселей CS2 масштабируются в зависимости от разрешения игры. Динамический разброс использует движения и удары GoldSrc. Последующая отдача сохраняется в коде общего доступа, но еще не отображается в игре.',
    'Center dot': 'Центральная точка',
    Changelog: 'Журнал изменений',
    'Changes save automatically. Turn on In-game enhancements in General to use the crosshair during matches.':
      'Изменения сохраняются автоматически. Включите «Общие внутриигровые улучшения», чтобы использовать перекрестие во время матчей.',
    'Checking installation…': 'Проверка установки…',
    'Checking referral status…': 'Проверка статуса реферала…',
    'Choose a different installation': 'Выберите другую установку',
    'Choose installation folder': 'Выберите папку установки',
    'Choose the game folder or its cstrike subfolder. The launcher will find the executable and save your selection automatically.':
      'Выберите папку с игрой или ее подпапку cstrike. Программа запуска автоматически найдет исполняемый файл и сохранит ваш выбор.',
    'Code unavailable': 'Код недоступен',
    Color: 'Цвет',
    'Community links': 'Ссылки на сообщество',
    'Configure browser audio, voice, language, and account credentials.':
      'Настройте звук, голос, язык и учетные данные браузера.',
    'Connect Google, Facebook, or Discord so any provider can authenticate this same player account.':
      'Подключите Google, Facebook или Discord, чтобы любой провайдер мог аутентифицировать эту же учетную запись игрока.',
    Copied: 'Скопировано',
    Copy: 'Копировать',
    'Copy code': 'Скопировать код',
    'Could not save crosshair.': 'Не удалось сохранить прицел.',
    'Counter-Strike 1.6 on Steam': 'Counter-Strike 1.6 в Steam',
    'Counter-Strike path saved.': 'Путь Counter-Strike сохранен.',
    Crosshair: 'Перекрестие',
    'Crosshair preview': 'Предварительный просмотр перекрестия',
    'Custom Setup': 'Пользовательская настройка',
    'Custom crosshairs are available in the desktop launcher. Download it to edit your crosshair and use it in Counter-Strike.':
      'Пользовательские перекрестия доступны в панели запуска на рабочем столе. Загрузите его, чтобы редактировать прицел и использовать его в Counter-Strike.',
    "Custom in-game crosshairs are temporarily disabled while we revise compatibility with different Counter-Strike clients. Your game's normal crosshair remains active.":
      'Пользовательские внутриигровые перекрестия временно отключены, пока мы пересматриваем совместимость с различными клиентами Counter-Strike. Обычное перекрестие вашей игры остается активным.',
    'Desktop client required': 'Требуется настольный клиент',
    'Desktop only': 'Только рабочий стол',
    'Detect installation now': 'Обнаружить установку сейчас',
    'Detecting Counter-Strike…': 'Обнаружение Counter-Strike…',
    'Download desktop launcher': 'Скачать лаунчер для рабочего стола',
    'Downloading installer': 'Скачивание установщика',
    'Dynamic gap': 'Динамический разрыв',
    'Enable In-game enhancements in General to use kill cards.':
      'Включите общие внутриигровые улучшения, чтобы использовать карты убийств.',
    'Enable animated kill cards': 'Включить анимированные карты убийств',
    'Enable fast weapon switch': 'Включить быстрое переключение оружия',
    'Enable in-game enhancements': 'Включить внутриигровые улучшения',
    'Enter 1.6 Competitive': 'Введите 1.6 Соревновательный',
    'Fast weapon switch': 'Быстрая смена оружия',
    'Finish the Windows installer. We’ll detect the folder you choose.':
      'Завершите установку Windows. Мы определим выбранную вами папку.',
    'Follow & support': 'Подписывайтесь и поддерживайте',
    Full: 'Полный',
    'Get desktop app': 'Получить настольное приложение',
    'Get the desktop client': 'Получите настольный клиент',
    'HUD and crosshair': 'HUD и перекрестие',
    Half: 'Половина',
    'Import code': 'Импортировать код',
    'In-game appearance': 'Внешний вид в игре',
    'In-game enhancements': 'Улучшения в игре',
    'Install NextClient': 'Установить следующий клиент',
    'Install NextClient from its official download, or select an existing installation above.':
      'Установите NextClient из официальной загрузки или выберите существующую установку выше.',
    'Installation folder': 'Папка установки',
    'Installation selected': 'Установка выбрана',
    'Installer opened': 'Установщик открыт',
    'Invalid crosshair code.': 'Неверный код перекрестия.',
    'Invite a friend': 'Пригласить друга',
    'Invite friends later using your own code in Settings.':
      'Пригласите друзей позже, используя свой код в настройках.',
    'Loading referral code': 'Загрузка реферального кода',
    'NextClient installation could not be selected.': 'Не удалось выбрать установку NextClient.',
    'NextClient requires Windows.': 'Для NextClient требуется Windows.',
    'NextClient was not detected. Choose its installation folder.':
      'NextClient не обнаружен. Выберите папку для установки.',
    'No Counter-Strike folder selected': 'Папка Counter-Strike не выбрана',
    'No installation selected': 'Установка не выбрана',
    'No maps are available for this mode': 'Для этого режима нет доступных карт.',
    'Open Counter-Strike on Steam': 'Открыть Counter-Strike в Steam',
    'Open Steam store': 'Открыть магазин Steam',
    Outline: 'Схема',
    'Outline color': 'Цвет контура',
    'Own the game on Steam, then select its Half-Life folder.':
      'Приобретите игру в Steam, затем выберите папку Half-Life.',
    'Paste a CS2 or CSGO code or tune the controls. Changes save automatically for 1.6 Competitive matches.':
      'Вставьте код CS2 или CSGO или настройте элементы управления. Изменения сохраняются автоматически для соревновательных матчей версии 1.6.',
    'Paste a CS2 or CSGO crosshair code to import and save it immediately. Older CSGO codes are converted to the current format.':
      'Вставьте код перекрестия CS2 или CSGO, чтобы немедленно импортировать и сохранить его. Старые коды CSGO конвертируются в текущий формат.',
    'Preparing your lobby…': 'Подготовка лобби…',
    Recommended: 'Рекомендуется',
    'Recommended Setup': 'Рекомендуемая настройка',
    'Referral code already used on this account.':
      'Реферальный код уже используется в этом аккаунте.',
    'Reopen browser': 'Перезапустить браузер',
    'Required match files are checked before each game launches. You can change the installation and features in Settings later.':
      'Обязательные файлы совпадений проверяются перед запуском каждой игры. Вы можете изменить установку и функции в настройках позже.',
    'Restore recommended': 'Рекомендуется восстановить',
    'Retry detection': 'Повторить обнаружение',
    'Retry installer': 'Повторить попытку установки',
    'Retry save': 'Повторить попытку сохранения',
    'Save your Counter-Strike folder above before downloading assets.':
      'Прежде чем загружать ресурсы, сохраните папку Counter-Strike, указанную выше.',
    'Saving your setup…': 'Сохранение настроек…',
    'Select the code above to copy it manually.':
      'Выберите код выше, чтобы скопировать его вручную.',
    'Select weapons immediately with number keys. Custom Setup leaves your game preference alone until you change this switch.':
      'Сразу выбирайте оружие с помощью цифровых клавиш. Пользовательская настройка оставляет ваши игровые предпочтения в покое, пока вы не измените этот переключатель.',
    'Set up your Counter-Strike 1.6 folder before reconnecting to the match.':
      'Настройте папку Counter-Strike 1.6 перед повторным подключением к матчу.',
    'Setup preference': 'Настройка предпочтений',
    'Share your referral code. When a friend uses it, you both receive rewards.':
      'Поделитесь своим реферальным кодом. Когда друг использует его, вы оба получаете награды.',
    'Show an animated card for each kill above the round timer. The last card is ACE in 3v3 or 5v5. FFA stacks up to 16 cards without ACE.':
      'Покажите анимированную карточку за каждое убийство над таймером раунда. Последняя карта — ACE в боях 3 на 3 или 5 на 5. FFA складывает до 16 карт без ACE.',
    'Show the 1.6 Competitive scoreboard, crosshair, teammate tags, and kill cards in supported Counter-Strike 1.6 clients on Steam and standalone installations on Windows or Linux. NextClient uses its own compatible host and crosshair settings. Game files are restored after exit. This setting does not control match screenshot review.':
      'Показывать табло 1.6 Competitive, прицел, метки союзников и карточки убийств в поддерживаемых клиентах Counter-Strike 1.6 в Steam и отдельных установках Windows или Linux. NextClient использует собственные настройки. Игровые файлы восстанавливаются после выхода. Этот параметр не влияет на проверку скриншотов матча.',
    'Skip for now': 'Пропустить сейчас',
    'Streamed from your region': 'Трансляция из вашего региона',
    Style: 'Стиль',
    'The web app streams managed skin and model assets from the selected regional server. There is no launcher asset folder to download or repair.':
      'Веб-приложение передает управляемые ресурсы скинов и моделей с выбранного регионального сервера. Нет папки ресурсов программы запуска, которую можно было бы загрузить или восстановить.',
    'This game mode is not available for Web Play. Choose another mode or use a desktop-only party.':
      'Этот игровой режим недоступен для сетевой игры. Выберите другой режим или используйте вечеринку только для рабочего стола.',
    'This mode is unavailable for Web Play or mixed parties':
      'Этот режим недоступен для сетевой игры или смешанных вечеринок.',
    'This mode is unavailable for Web Play or mixed parties.':
      'Этот режим недоступен для сетевой игры или смешанных вечеринок.',
    'Use CS2 controls': 'Используйте элементы управления CS2',
    'Using your game preference': 'Использование ваших игровых предпочтений',
    'Waiting for a folder…': 'Ожидание папки…',
    'Web Play party: the leader can choose modes enabled for browser players.':
      'Вечеринка в веб-игре: лидер может выбирать режимы, доступные для браузерных игроков.',
    'Windows only': 'только для Windows',
    "You're all set": 'Все готово',
    'Your first-run preference. You can adjust each feature below.':
      'Ваши предпочтения при первом запуске. Вы можете настроить каждую функцию ниже.',
    'Your personal Counter-Strike settings stay yours.':
      'Ваши личные настройки Counter-Strike останутся за вами.',
    'Your setup is saved. Entering the launcher now.':
      'Ваша настройка сохранена. Сейчас захожу в лаунчер.',
    Back: 'Назад',
    Close: 'Закрыть',
    'Installation found': 'Установка найдена',
    'No installation': 'Без установки',
    None: 'Нет',
    Retry: 'Повторить попытку',
    'COUNTER-STRIKE 1.6 WEB PLAY': 'COUNTER-STRIKE 1.6 ОНЛАЙН-ИГРА',
    'Web Play modes vary. Ranked 5v5 and exclusive launcher features require the desktop client.':
      'Режимы Web Play различаются. Для рейтингового боя 5 на 5 и эксклюзивных функций запуска требуется клиент для настольного компьютера.'
  },
  tl: {
    '1.6 Competitive by Papamo reserves this mode for desktop players. Everyone in your party must use the desktop client before the leader can queue.':
      'Inilalaan ng 1.6 Competitive ng Papamo ang mode na ito para sa mga desktop player. Dapat gamitin ng lahat sa iyong partido ang desktop client bago makapila ang pinuno.',
    '1.6 Competitive settings': 'Mga setting ng 1.6 Competitive',
    'Animated kill cards': 'Mga animated na kill card',
    'Apply code': 'Ilapat ang code',
    'Applying referral code…': 'Inilalapat ang referral code…',
    'Assets & previews': 'Mga asset at preview',
    'Back to website': 'Bumalik sa website',
    'Browser matches launch the Steam copy of Counter-Strike directly. You do not need to choose a local game folder or install launcher-managed files.':
      'Direktang inilunsad ng mga browser match ang Steam copy ng Counter-Strike. Hindi mo kailangang pumili ng lokal na folder ng laro o mag-install ng mga file na pinamamahalaan ng launcher.',
    'By accepting, you commit to this match. Leaving after acceptance may result in a penalty. Please ensure you are ready to play before continuing.':
      'Sa pagtanggap, nangangako ka sa laban na ito. Ang pag-alis pagkatapos ng pagtanggap ay maaaring magresulta sa isang parusa. Pakitiyak na handa kang maglaro bago magpatuloy.',
    'CS2 / CSGO crosshair code': 'CS2 / CSGO crosshair code',
    'CS2 pixel sizes scale with the game resolution. Dynamic spread uses GoldSrc movement and shots. Follow recoil is saved in the share code but is not yet drawn in game.':
      'CS2 pixel sizes scale na may resolution ng laro. Ang dynamic na spread ay gumagamit ng GoldSrc na paggalaw at mga shot. Ang follow recoil ay naka-save sa share code ngunit hindi pa nabubunot sa laro.',
    'Center dot': 'Gitnang tuldok',
    Changelog: 'Changelog',
    'Changes save automatically. Turn on In-game enhancements in General to use the crosshair during matches.':
      'Awtomatikong nai-save ang mga pagbabago. I-on ang mga In-game na pagpapahusay sa Pangkalahatan para magamit ang crosshair sa panahon ng mga laban.',
    'Checking installation…': 'Sinusuri ang pag-install…',
    'Checking referral status…': 'Sinusuri ang katayuan ng referral...',
    'Choose a different installation': 'Pumili ng ibang pag-install',
    'Choose installation folder': 'Pumili ng folder ng pag-install',
    'Choose the game folder or its cstrike subfolder. The launcher will find the executable and save your selection automatically.':
      'Piliin ang folder ng laro o ang subfolder ng cstrike nito. Hahanapin ng launcher ang executable at awtomatikong i-save ang iyong pinili.',
    'Code unavailable': 'Hindi available ang code',
    Color: 'Kulay',
    'Community links': 'Mga link sa komunidad',
    'Configure browser audio, voice, language, and account credentials.':
      'I-configure ang audio ng browser, boses, wika, at mga kredensyal ng account.',
    'Connect Google, Facebook, or Discord so any provider can authenticate this same player account.':
      'Ikonekta ang Google, Facebook, o Discord para ma-authenticate ng sinumang provider ang parehong player account na ito.',
    Copied: 'Kinopya',
    Copy: 'Kopyahin',
    'Copy code': 'Kopyahin ang code',
    'Could not save crosshair.': 'Hindi ma-save ang crosshair.',
    'Counter-Strike 1.6 on Steam': 'Counter-Strike 1.6 sa Steam',
    'Counter-Strike path saved.': 'Na-save ang Counter-Strike path.',
    Crosshair: 'Crosshair',
    'Crosshair preview': 'Crosshair preview',
    'Custom Setup': 'Custom na Setup',
    'Custom crosshairs are available in the desktop launcher. Download it to edit your crosshair and use it in Counter-Strike.':
      'Available ang mga custom na crosshair sa desktop launcher. I-download ito para i-edit ang iyong crosshair at gamitin ito sa Counter-Strike.',
    "Custom in-game crosshairs are temporarily disabled while we revise compatibility with different Counter-Strike clients. Your game's normal crosshair remains active.":
      "Pansamantalang hindi pinagana ang mga custom na in-game crosshair habang binabago namin ang pagiging tugma sa iba't ibang kliyente ng Counter-Strike. Nananatiling aktibo ang normal na crosshair ng iyong laro.",
    'Desktop client required': 'Kinakailangan ang desktop client',
    'Desktop only': 'Desktop lang',
    'Detect installation now': 'Alamin ang pag-install ngayon',
    'Detecting Counter-Strike…': 'Pag-detect ng Counter-Strike...',
    'Download desktop launcher': 'I-download ang desktop launcher',
    'Downloading installer': 'Nagda-download ng installer',
    'Dynamic gap': 'Dynamic na agwat',
    'Enable In-game enhancements in General to use kill cards.':
      'Paganahin ang mga In-game na pagpapahusay sa Pangkalahatan para gumamit ng mga kill card.',
    'Enable animated kill cards': 'Paganahin ang mga animated na kill card',
    'Enable fast weapon switch': 'Paganahin ang mabilis na paglipat ng armas',
    'Enable in-game enhancements': 'Paganahin ang mga in-game na pagpapahusay',
    'Enter 1.6 Competitive': 'Ipasok ang 1.6 Competitive',
    'Fast weapon switch': 'Mabilis na switch ng armas',
    'Finish the Windows installer. We’ll detect the folder you choose.':
      'Tapusin ang installer ng Windows. Makikita namin ang folder na pipiliin mo.',
    'Follow & support': 'Subaybayan at suportahan',
    Full: 'Puno',
    'Get desktop app': 'Kumuha ng desktop app',
    'Get the desktop client': 'Kunin ang desktop client',
    'HUD and crosshair': 'HUD at crosshair',
    Half: 'kalahati',
    'Import code': 'Import code',
    'In-game appearance': 'In-game na hitsura',
    'In-game enhancements': 'Mga pagpapahusay sa laro',
    'Install NextClient': 'I-install ang NextClient',
    'Install NextClient from its official download, or select an existing installation above.':
      'I-install ang NextClient mula sa opisyal na pag-download nito, o pumili ng kasalukuyang pag-install sa itaas.',
    'Installation folder': 'Folder ng pag-install',
    'Installation selected': 'Napili ang pag-install',
    'Installer opened': 'Binuksan ang installer',
    'Invalid crosshair code.': 'Di-wastong crosshair code.',
    'Invite a friend': 'Mag-imbita ng kaibigan',
    'Invite friends later using your own code in Settings.':
      'Mag-imbita ng mga kaibigan sa ibang pagkakataon gamit ang sarili mong code sa Mga Setting.',
    'Loading referral code': 'Nilo-load ang referral code',
    'NextClient installation could not be selected.': 'Hindi mapili ang pag-install ng NextClient.',
    'NextClient requires Windows.': 'Ang NextClient ay nangangailangan ng Windows.',
    'NextClient was not detected. Choose its installation folder.':
      'Hindi nakita ang NextClient. Piliin ang folder ng pag-install nito.',
    'No Counter-Strike folder selected': 'Walang napiling folder ng Counter-Strike',
    'No installation selected': 'Walang napiling pag-install',
    'No maps are available for this mode': 'Walang magagamit na mga mapa para sa mode na ito',
    'Open Counter-Strike on Steam': 'Buksan ang Counter-Strike sa Steam',
    'Open Steam store': 'Buksan ang Steam store',
    Outline: 'Balangkas',
    'Outline color': 'Kulay ng balangkas',
    'Own the game on Steam, then select its Half-Life folder.':
      'Pagmamay-ari ang laro sa Steam, pagkatapos ay piliin ang Half-Life folder nito.',
    'Paste a CS2 or CSGO code or tune the controls. Changes save automatically for 1.6 Competitive matches.':
      'Mag-paste ng CS2 o CSGO code o ibagay ang mga kontrol. Awtomatikong nai-save ang mga pagbabago para sa 1.6 Competitive na tugma.',
    'Paste a CS2 or CSGO crosshair code to import and save it immediately. Older CSGO codes are converted to the current format.':
      'Mag-paste ng CS2 o CSGO crosshair code para i-import at i-save ito kaagad. Ang mga lumang CSGO code ay kino-convert sa kasalukuyang format.',
    'Preparing your lobby…': 'Inihahanda ang iyong lobby…',
    Recommended: 'Inirerekomenda',
    'Recommended Setup': 'Inirerekomendang Pag-setup',
    'Referral code already used on this account.':
      'Nagamit na ang referral code sa account na ito.',
    'Reopen browser': 'Buksan muli ang browser',
    'Required match files are checked before each game launches. You can change the installation and features in Settings later.':
      'Ang mga kinakailangang file ng tugma ay sinusuri bago ilunsad ang bawat laro. Maaari mong baguhin ang pag-install at mga tampok sa Mga Setting sa ibang pagkakataon.',
    'Restore recommended': 'Inirerekomenda ang pagpapanumbalik',
    'Retry detection': 'Subukang muli ang pagtuklas',
    'Retry installer': 'Subukan muli ang installer',
    'Retry save': 'Subukang muli ang pag-save',
    'Save your Counter-Strike folder above before downloading assets.':
      'I-save ang iyong Counter-Strike na folder sa itaas bago mag-download ng mga asset.',
    'Saving your setup…': 'Sine-save ang iyong setup…',
    'Select the code above to copy it manually.':
      'Piliin ang code sa itaas upang kopyahin ito nang manu-mano.',
    'Select weapons immediately with number keys. Custom Setup leaves your game preference alone until you change this switch.':
      'Pumili kaagad ng mga armas gamit ang mga number key. Hinahayaan ng Custom na Setup ang iyong kagustuhan sa laro hanggang sa baguhin mo ang switch na ito.',
    'Set up your Counter-Strike 1.6 folder before reconnecting to the match.':
      'I-set up ang iyong Counter-Strike 1.6 na folder bago muling kumonekta sa laban.',
    'Setup preference': 'Kagustuhan sa pag-setup',
    'Share your referral code. When a friend uses it, you both receive rewards.':
      'Ibahagi ang iyong referral code. Kapag ginamit ito ng isang kaibigan, pareho kayong makakatanggap ng mga reward.',
    'Show an animated card for each kill above the round timer. The last card is ACE in 3v3 or 5v5. FFA stacks up to 16 cards without ACE.':
      'Magpakita ng animated na card para sa bawat pagpatay sa itaas ng round timer. Ang huling card ay ACE sa 3v3 o 5v5. Nag-stack ang FFA ng hanggang 16 na card na walang ACE.',
    'Show the 1.6 Competitive scoreboard, crosshair, teammate tags, and kill cards in supported Counter-Strike 1.6 clients on Steam and standalone installations on Windows or Linux. NextClient uses its own compatible host and crosshair settings. Game files are restored after exit. This setting does not control match screenshot review.':
      'Ipakita ang 1.6 Competitive scoreboard, crosshair, teammate tags, at kill cards sa supported Counter-Strike 1.6 clients sa Steam at standalone installs sa Windows o Linux. Sariling compatible host at crosshair settings ang gamit ng NextClient. Ibinabalik ang game files pag-exit. Hindi nito kontrolado ang match screenshot review.',
    'Skip for now': 'Laktawan sa ngayon',
    'Streamed from your region': 'Naka-stream mula sa iyong rehiyon',
    Style: 'Estilo',
    'The web app streams managed skin and model assets from the selected regional server. There is no launcher asset folder to download or repair.':
      'Ang mga stream ng web app ay pinamamahalaan ang mga asset ng balat at modelo mula sa napiling rehiyonal na server. Walang launcher asset folder na ida-download o aayusin.',
    'This game mode is not available for Web Play. Choose another mode or use a desktop-only party.':
      'Ang game mode na ito ay hindi available para sa Web Play. Pumili ng ibang mode o gumamit ng isang desktop-only party.',
    'This mode is unavailable for Web Play or mixed parties':
      'Hindi available ang mode na ito para sa Web Play o mixed party',
    'This mode is unavailable for Web Play or mixed parties.':
      'Hindi available ang mode na ito para sa Web Play o mixed party.',
    'Use CS2 controls': 'Gumamit ng mga kontrol ng CS2',
    'Using your game preference': 'Gamit ang iyong kagustuhan sa laro',
    'Waiting for a folder…': 'Naghihintay ng folder…',
    'Web Play party: the leader can choose modes enabled for browser players.':
      'Web Play party: ang pinuno ay maaaring pumili ng mga mode na pinagana para sa mga manlalaro ng browser.',
    'Windows only': 'Windows lang',
    "You're all set": 'Handa ka na',
    'Your first-run preference. You can adjust each feature below.':
      'Ang iyong kagustuhan sa unang pagtakbo. Maaari mong ayusin ang bawat tampok sa ibaba.',
    'Your personal Counter-Strike settings stay yours.':
      'Mananatili sa iyo ang iyong mga personal na setting ng Counter-Strike.',
    'Your setup is saved. Entering the launcher now.':
      'Na-save ang iyong setup. Pagpasok sa launcher ngayon.',
    'Account credentials': 'Mga kredensyal ng account',
    Assets: 'Mga asset',
    'Assets & downloads': 'Mga asset at pag-download',
    Audio: 'Tunog',
    Back: 'Bumalik',
    Browse: 'Mag-browse',
    'Change password': 'Baguhin ang password',
    'Change username': 'Baguhin ang username',
    Close: 'Isara',
    'Confirm new password': 'Kumpirmahin ang bagong password',
    Connected: 'Nakakonekta',
    'Connected accounts': 'Mga konektadong account',
    Continue: 'Magpatuloy',
    'Create password': 'Lumikha ng password',
    'Current username': 'Kasalukuyang username',
    'Download assets': 'Mag-download ng mga asset',
    'Exit to desktop': 'Lumabas sa desktop',
    'Game assets': 'Mga asset ng laro',
    'Game client': 'Kliyente ng laro',
    General: 'Heneral',
    'Installation found': 'Natagpuan ang pag-install',
    Launcher: 'Launcher',
    'Launcher settings': 'Mga setting ng launcher',
    'Music set': 'Set ng musika',
    'New password': 'Bagong password',
    'New username': 'Bagong username',
    'No installation': 'Walang pag-install',
    None: 'wala',
    'Opening…': 'Binubuksan…',
    'Repair assets': 'Pag-aayos ng mga ari-arian',
    Retry: 'Subukan muli',
    'Saving…': 'Sine-save...',
    Settings: 'Mga setting',
    'Sign out': 'Mag-sign out',
    'Signing out…': 'Nagsa-sign out…',
    'Skin asset download progress': 'Pag-usad ng pag-download ng skin asset',
    Username: 'Username',
    'Verify password': 'I-verify ang password',
    'Voice & Audio': 'Boses at Audio',
    'COUNTER-STRIKE 1.6 WEB PLAY': 'KONTRA-STRIKE 1.6 WEB PLAY',
    'Web Play modes vary. Ranked 5v5 and exclusive launcher features require the desktop client.':
      'Ang mga mode ng Web Play ay nag-iiba. Ang ranggo na 5v5 at eksklusibong mga feature ng launcher ay nangangailangan ng desktop client.'
  },
  th: {
    '1.6 Competitive by Papamo reserves this mode for desktop players. Everyone in your party must use the desktop client before the leader can queue.':
      '1.6 Competitive by Papamo สงวนโหมดนี้ไว้สำหรับผู้เล่นบนเดสก์ท็อป ทุกคนในปาร์ตี้ของคุณต้องใช้ไคลเอนต์เดสก์ท็อปก่อนที่ผู้นำจะสามารถเข้าคิวได้',
    '1.6 Competitive settings': 'การตั้งค่า 1.6 Competitive',
    'Animated kill cards': 'การ์ดสังหารแบบเคลื่อนไหว',
    'Apply code': 'ใส่โค้ด',
    'Applying referral code…': 'กำลังใช้รหัสอ้างอิง...',
    'Assets & previews': 'เนื้อหาและตัวอย่าง',
    'Back to website': 'กลับสู่เว็บไซต์',
    'Browser matches launch the Steam copy of Counter-Strike directly. You do not need to choose a local game folder or install launcher-managed files.':
      'การแข่งขันเบราว์เซอร์จะเปิดสำเนา Steam ของ Counter-Strike โดยตรง คุณไม่จำเป็นต้องเลือกโฟลเดอร์เกมในเครื่องหรือติดตั้งไฟล์ที่จัดการโดยตัวเรียกใช้งาน',
    'By accepting, you commit to this match. Leaving after acceptance may result in a penalty. Please ensure you are ready to play before continuing.':
      'การยอมรับแสดงว่าคุณตกลงเข้าร่วมการแข่งขันครั้งนี้ การออกไปหลังจากได้รับการยอมรับอาจส่งผลให้มีการลงโทษ โปรดตรวจสอบให้แน่ใจว่าคุณพร้อมที่จะเล่นก่อนดำเนินการต่อ',
    'CS2 / CSGO crosshair code': 'รหัสเป้าเล็ง CS2 / CSGO',
    'CS2 pixel sizes scale with the game resolution. Dynamic spread uses GoldSrc movement and shots. Follow recoil is saved in the share code but is not yet drawn in game.':
      'ขนาดพิกเซล CS2 จะปรับขนาดตามความละเอียดของเกม สเปรดแบบไดนามิกใช้การเคลื่อนไหวและช็อตของ GoldSrc การหดตัวตามจะถูกบันทึกไว้ในรหัสแชร์ แต่ยังไม่ได้วาดในเกม',
    'Center dot': 'จุดศูนย์กลาง',
    Changelog: 'บันทึกการเปลี่ยนแปลง',
    'Changes save automatically. Turn on In-game enhancements in General to use the crosshair during matches.':
      'การเปลี่ยนแปลงบันทึกโดยอัตโนมัติ เปิดการปรับปรุงในเกมโดยทั่วไปเพื่อใช้เป้าเล็งในระหว่างการแข่งขัน',
    'Checking installation…': 'กำลังตรวจสอบการติดตั้ง...',
    'Checking referral status…': 'กำลังตรวจสอบสถานะการอ้างอิง...',
    'Choose a different installation': 'เลือกการติดตั้งอื่น',
    'Choose installation folder': 'เลือกโฟลเดอร์การติดตั้ง',
    'Choose the game folder or its cstrike subfolder. The launcher will find the executable and save your selection automatically.':
      'เลือกโฟลเดอร์เกมหรือโฟลเดอร์ย่อย cstrike ตัวเรียกใช้งานจะค้นหาไฟล์ปฏิบัติการและบันทึกการเลือกของคุณโดยอัตโนมัติ',
    'Code unavailable': 'รหัสไม่พร้อมใช้งาน',
    Color: 'สี',
    'Community links': 'ลิงก์ชุมชน',
    'Configure browser audio, voice, language, and account credentials.':
      'กำหนดค่าเสียง เสียง ภาษา และข้อมูลรับรองบัญชีของเบราว์เซอร์',
    'Connect Google, Facebook, or Discord so any provider can authenticate this same player account.':
      'เชื่อมต่อ Google, Facebook หรือ Discord เพื่อให้ผู้ให้บริการสามารถตรวจสอบบัญชีผู้เล่นเดียวกันนี้ได้',
    Copied: 'คัดลอกแล้ว',
    Copy: 'คัดลอก',
    'Copy code': 'คัดลอกรหัส',
    'Could not save crosshair.': 'ไม่สามารถบันทึกเป้าเล็งได้',
    'Counter-Strike 1.6 on Steam': 'Counter-Strike 1.6 บน Steam',
    'Counter-Strike path saved.': 'บันทึกเส้นทาง Counter-Strike แล้ว',
    Crosshair: 'ครอสแฮร์',
    'Crosshair preview': 'ภาพตัวอย่าง Crosshair',
    'Custom Setup': 'การตั้งค่าแบบกำหนดเอง',
    'Custom crosshairs are available in the desktop launcher. Download it to edit your crosshair and use it in Counter-Strike.':
      'กากบาทแบบกำหนดเองมีอยู่ใน Launcher ของเดสก์ท็อป ดาวน์โหลดเพื่อแก้ไขเป้าเล็งของคุณและใช้ใน Counter-Strike',
    "Custom in-game crosshairs are temporarily disabled while we revise compatibility with different Counter-Strike clients. Your game's normal crosshair remains active.":
      'เป้าเล็งในเกมแบบกำหนดเองจะถูกปิดการใช้งานชั่วคราวในขณะที่เราแก้ไขความเข้ากันได้กับไคลเอนต์ Counter-Strike ที่แตกต่างกัน เป้าเล็งปกติของเกมของคุณยังคงทำงานอยู่',
    'Desktop client required': 'จำเป็นต้องมีไคลเอนต์เดสก์ท็อป',
    'Desktop only': 'เดสก์ท็อปเท่านั้น',
    'Detect installation now': 'ตรวจพบการติดตั้งทันที',
    'Detecting Counter-Strike…': 'กำลังตรวจจับเคาน์เตอร์สไตรค์...',
    'Download desktop launcher': 'ดาวน์โหลดตัวเรียกใช้งานเดสก์ท็อป',
    'Downloading installer': 'กำลังดาวน์โหลดตัวติดตั้ง',
    'Dynamic gap': 'ช่องว่างแบบไดนามิก',
    'Enable In-game enhancements in General to use kill cards.':
      'เปิดใช้งานการปรับปรุงในเกมโดยทั่วไปเพื่อใช้คิลการ์ด',
    'Enable animated kill cards': 'เปิดใช้งานการ์ดสังหารแบบเคลื่อนไหว',
    'Enable fast weapon switch': 'เปิดใช้งานการสลับอาวุธอย่างรวดเร็ว',
    'Enable in-game enhancements': 'เปิดใช้งานการปรับปรุงในเกม',
    'Enter 1.6 Competitive': 'เข้าสู่ 1.6 การแข่งขัน',
    'Fast weapon switch': 'สลับอาวุธอย่างรวดเร็ว',
    'Finish the Windows installer. We’ll detect the folder you choose.':
      'เสร็จสิ้นการติดตั้ง Windows เราจะตรวจพบโฟลเดอร์ที่คุณเลือก',
    'Follow & support': 'ติดตามและสนับสนุน',
    Full: 'เต็ม',
    'Get desktop app': 'รับแอปเดสก์ท็อป',
    'Get the desktop client': 'รับไคลเอ็นต์เดสก์ท็อป',
    'HUD and crosshair': 'HUD และเป้าเล็ง',
    Half: 'ครึ่งหนึ่ง',
    'Import code': 'รหัสนำเข้า',
    'In-game appearance': 'รูปลักษณ์ภายในเกม',
    'In-game enhancements': 'การปรับปรุงในเกม',
    'Install NextClient': 'ติดตั้ง NextClient',
    'Install NextClient from its official download, or select an existing installation above.':
      'ติดตั้ง NextClient จากการดาวน์โหลดอย่างเป็นทางการ หรือเลือกการติดตั้งที่มีอยู่ด้านบน',
    'Installation folder': 'โฟลเดอร์การติดตั้ง',
    'Installation selected': 'เลือกการติดตั้งแล้ว',
    'Installer opened': 'เปิดโปรแกรมติดตั้งแล้ว',
    'Invalid crosshair code.': 'รหัสเส้นเล็งไม่ถูกต้อง',
    'Invite a friend': 'ชวนเพื่อน',
    'Invite friends later using your own code in Settings.':
      'เชิญเพื่อนในภายหลังโดยใช้รหัสของคุณเองในการตั้งค่า',
    'Loading referral code': 'กำลังโหลดรหัสอ้างอิง',
    'NextClient installation could not be selected.': 'ไม่สามารถเลือกการติดตั้ง NextClient ได้',
    'NextClient requires Windows.': 'NextClient ต้องใช้ Windows',
    'NextClient was not detected. Choose its installation folder.':
      'ตรวจไม่พบ NextClient เลือกโฟลเดอร์การติดตั้ง',
    'No Counter-Strike folder selected': 'ไม่ได้เลือกโฟลเดอร์ Counter-Strike',
    'No installation selected': 'ไม่ได้เลือกการติดตั้ง',
    'No maps are available for this mode': 'ไม่มีแผนที่สำหรับโหมดนี้',
    'Open Counter-Strike on Steam': 'เปิด Counter-Strike บน Steam',
    'Open Steam store': 'เปิดร้าน Steam',
    Outline: 'โครงร่าง',
    'Outline color': 'สีเค้าร่าง',
    'Own the game on Steam, then select its Half-Life folder.':
      'เป็นเจ้าของเกมบน Steam จากนั้นเลือกโฟลเดอร์ Half-Life',
    'Paste a CS2 or CSGO code or tune the controls. Changes save automatically for 1.6 Competitive matches.':
      'วางรหัส CS2 หรือ CSGO หรือปรับแต่งส่วนควบคุม การเปลี่ยนแปลงจะบันทึกโดยอัตโนมัติสำหรับ 1.6 การแข่งขันแบบแข่งขัน',
    'Paste a CS2 or CSGO crosshair code to import and save it immediately. Older CSGO codes are converted to the current format.':
      'วางโค้ดเส้นเล็ง CS2 หรือ CSGO เพื่อนำเข้าและบันทึกทันที รหัส CSGO เก่าจะถูกแปลงเป็นรูปแบบปัจจุบัน',
    'Preparing your lobby…': 'กำลังเตรียมล็อบบี้ของคุณ...',
    Recommended: 'แนะนำ',
    'Recommended Setup': 'การตั้งค่าที่แนะนำ',
    'Referral code already used on this account.': 'รหัสอ้างอิงถูกใช้ไปแล้วในบัญชีนี้',
    'Reopen browser': 'เปิดเบราว์เซอร์อีกครั้ง',
    'Required match files are checked before each game launches. You can change the installation and features in Settings later.':
      'ไฟล์การแข่งขันที่จำเป็นจะถูกตรวจสอบก่อนแต่ละเกมจะเปิดตัว คุณสามารถเปลี่ยนการติดตั้งและคุณสมบัติในการตั้งค่าได้ในภายหลัง',
    'Restore recommended': 'แนะนำให้คืนค่า',
    'Retry detection': 'ลองตรวจหาอีกครั้ง',
    'Retry installer': 'ลองติดตั้งอีกครั้ง',
    'Retry save': 'ลองบันทึกอีกครั้ง',
    'Save your Counter-Strike folder above before downloading assets.':
      'บันทึกโฟลเดอร์ Counter-Strike ของคุณด้านบนก่อนที่จะดาวน์โหลดเนื้อหา',
    'Saving your setup…': 'กำลังบันทึกการตั้งค่าของคุณ...',
    'Select the code above to copy it manually.': 'เลือกโค้ดด้านบนเพื่อคัดลอกด้วยตนเอง',
    'Select weapons immediately with number keys. Custom Setup leaves your game preference alone until you change this switch.':
      'เลือกอาวุธทันทีด้วยปุ่มตัวเลข การตั้งค่าแบบกำหนดเองจะปล่อยให้การตั้งค่าเกมของคุณอยู่คนเดียวจนกว่าคุณจะเปลี่ยนสวิตช์นี้',
    'Set up your Counter-Strike 1.6 folder before reconnecting to the match.':
      'ตั้งค่าโฟลเดอร์ Counter-Strike 1.6 ของคุณก่อนที่จะเชื่อมต่อกับการแข่งขันอีกครั้ง',
    'Setup preference': 'ตั้งค่ากำหนด',
    'Share your referral code. When a friend uses it, you both receive rewards.':
      'แบ่งปันรหัสอ้างอิงของคุณ เมื่อเพื่อนใช้มัน คุณทั้งคู่จะได้รับรางวัล',
    'Show an animated card for each kill above the round timer. The last card is ACE in 3v3 or 5v5. FFA stacks up to 16 cards without ACE.':
      'แสดงการ์ดภาพเคลื่อนไหวสำหรับการสังหารแต่ละครั้งเหนือตัวจับเวลายก ไพ่ใบสุดท้ายคือ ACE ใน 3v3 หรือ 5v5 FFA ซ้อนการ์ดได้สูงสุด 16 ใบโดยไม่มี ACE',
    'Show the 1.6 Competitive scoreboard, crosshair, teammate tags, and kill cards in supported Counter-Strike 1.6 clients on Steam and standalone installations on Windows or Linux. NextClient uses its own compatible host and crosshair settings. Game files are restored after exit. This setting does not control match screenshot review.':
      'แสดงกระดานคะแนน 1.6 Competitive เป้าเล็ง ป้ายชื่อเพื่อนร่วมทีม และการ์ดการสังหารในไคลเอนต์ Counter-Strike 1.6 ที่รองรับบน Steam หรือการติดตั้งแยกบน Windows และ Linux NextClient ใช้การตั้งค่าที่เข้ากันได้ของตนเอง ไฟล์เกมจะถูกคืนค่าหลังออกจากเกม การตั้งค่านี้ไม่เกี่ยวกับการตรวจภาพหน้าจอของแมตช์',
    'Skip for now': 'ข้ามไปก่อน',
    'Streamed from your region': 'สตรีมจากภูมิภาคของคุณ',
    Style: 'สไตล์',
    'The web app streams managed skin and model assets from the selected regional server. There is no launcher asset folder to download or repair.':
      'เว็บแอปจะสตรีมสกินที่ได้รับการจัดการและโมเดลสินทรัพย์จากเซิร์ฟเวอร์ภูมิภาคที่เลือก ไม่มีโฟลเดอร์สินทรัพย์ตัวเรียกใช้งานให้ดาวน์โหลดหรือซ่อมแซม',
    'This game mode is not available for Web Play. Choose another mode or use a desktop-only party.':
      'โหมดเกมนี้ไม่สามารถใช้ได้กับ Web Play เลือกโหมดอื่นหรือใช้ปาร์ตี้เฉพาะเดสก์ท็อป',
    'This mode is unavailable for Web Play or mixed parties':
      'โหมดนี้ใช้ไม่ได้สำหรับ Web Play หรือปาร์ตี้ผสม',
    'This mode is unavailable for Web Play or mixed parties.':
      'โหมดนี้ใช้ไม่ได้สำหรับ Web Play หรือปาร์ตี้ผสม',
    'Use CS2 controls': 'ใช้การควบคุม CS2',
    'Using your game preference': 'ใช้การตั้งค่าเกมของคุณ',
    'Waiting for a folder…': 'กำลังรอโฟลเดอร์...',
    'Web Play party: the leader can choose modes enabled for browser players.':
      'ปาร์ตี้การเล่นบนเว็บ: ผู้นำสามารถเลือกโหมดที่เปิดใช้งานสำหรับผู้เล่นเบราว์เซอร์',
    'Windows only': 'หน้าต่างเท่านั้น',
    "You're all set": 'คุณพร้อมแล้ว',
    'Your first-run preference. You can adjust each feature below.':
      'การตั้งค่าการรันครั้งแรกของคุณ คุณสามารถปรับคุณสมบัติแต่ละอย่างได้ด้านล่างนี้',
    'Your personal Counter-Strike settings stay yours.':
      'การตั้งค่า Counter-Strike ส่วนตัวของคุณยังคงเป็นของคุณ',
    'Your setup is saved. Entering the launcher now.':
      'บันทึกการตั้งค่าของคุณแล้ว เข้าสู่ตัวเรียกใช้งานทันที',
    '3–32 characters: letters, numbers, and underscores.':
      'อักขระ 3–32 ตัว: ตัวอักษร ตัวเลข และขีดล่าง',
    'Add a password to enable username/password login for this account.':
      'เพิ่มรหัสผ่านเพื่อเปิดใช้งานการเข้าสู่ระบบชื่อผู้ใช้/รหัสผ่านสำหรับบัญชีนี้',
    'Asset maintenance is unavailable while matchmaking or a match is active.':
      'การบำรุงรักษาสินทรัพย์ไม่สามารถใช้งานได้ในขณะที่การค้นหาแมตช์หรือแมตช์กำลังทำงานอยู่',
    'Assets have not been checked this session.': 'เซสชันนี้ยังไม่ได้ตรวจสอบเนื้อหา',
    Back: 'กลับ',
    'Check, download, or repair the managed game assets used by 1.6 Competitive.':
      'ตรวจสอบ ดาวน์โหลด หรือซ่อมแซมทรัพย์สินเกมที่ได้รับการจัดการซึ่งใช้โดย 1.6 Competitive',
    'Choose a music set for the launcher. Each set can provide its own background music and match-found cue.':
      'เลือกชุดเพลงสำหรับตัวเรียกใช้งาน แต่ละชุดสามารถมีเพลงประกอบและคิวที่ตรงกันของตัวเองได้',
    Close: 'ปิด',
    'Configure the game client, manage downloaded assets, and update your account credentials.':
      'กำหนดค่าไคลเอนต์เกม จัดการเนื้อหาที่ดาวน์โหลด และอัปเดตข้อมูลรับรองบัญชีของคุณ',
    'Configure voice bindings, launcher music, and interface sound effects.':
      'กำหนดค่าการเชื่อมโยงเสียง เพลงตัวเรียกใช้งาน และเอฟเฟกต์เสียงของอินเทอร์เฟซ',
    'Control launcher music and interface sounds. These preferences are saved on this device.':
      'ควบคุมเพลงตัวเรียกใช้งานและเสียงอินเทอร์เฟซ การตั้งค่าเหล่านี้จะถูกบันทึกไว้ในอุปกรณ์นี้',
    'Download missing 1.6 Competitive models before matchmaking. Repair removes managed copies and downloads them again if local assets are damaged.':
      'ดาวน์โหลดโมเดลการแข่งขัน 1.6 ที่หายไปก่อนการจับคู่ การซ่อมแซมจะลบสำเนาที่ได้รับการจัดการออกและดาวน์โหลดอีกครั้งหากทรัพย์สินในเครื่องได้รับความเสียหาย',
    'Installation found': 'พบการติดตั้ง',
    'Manage your username, sign-in methods, and password.':
      'จัดการชื่อผู้ใช้ วิธีการลงชื่อเข้าใช้ และรหัสผ่านของคุณ',
    'No installation': 'ไม่มีการติดตั้ง',
    None: 'ไม่มี',
    Retry: 'ลองอีกครั้ง',
    'Verify your password before replacing it.': 'ตรวจสอบรหัสผ่านของคุณก่อนที่จะเปลี่ยน',
    'Visible to other players. You can change it once every 7 days.':
      'ผู้เล่นคนอื่นมองเห็นได้ คุณสามารถเปลี่ยนได้ทุกๆ 7 วัน',
    'COUNTER-STRIKE 1.6 WEB PLAY': 'COUNTER-Strike 1.6 เล่นบนเว็บ',
    'Web Play modes vary. Ranked 5v5 and exclusive launcher features require the desktop client.':
      'โหมด Web Play จะแตกต่างกันไป อันดับ 5v5 และฟีเจอร์ตัวเรียกใช้งานพิเศษต้องใช้ไคลเอนต์เดสก์ท็อป'
  },
  id: {
    Audio: 'Suara',
    '1.6 Competitive by Papamo reserves this mode for desktop players. Everyone in your party must use the desktop client before the leader can queue.':
      '1.6 Competitive dari Papamo menyediakan mode ini untuk pemain desktop. Semua anggota party harus memakai klien desktop sebelum pemimpin dapat masuk antrean.',
    '1.6 Competitive settings': 'Pengaturan 1.6 Competitive',
    'Animated kill cards': 'Kartu pembunuhan animasi',
    'Apply code': 'Terapkan kode',
    'Applying referral code…': 'Menerapkan kode referensi…',
    'Assets & previews': 'Aset & pratinjau',
    'Back to website': 'Kembali ke situs web',
    'Browser matches launch the Steam copy of Counter-Strike directly. You do not need to choose a local game folder or install launcher-managed files.':
      'Pertandingan browser meluncurkan salinan Steam Counter-Strike secara langsung. Anda tidak perlu memilih folder game lokal atau menginstal file yang dikelola peluncur.',
    'By accepting, you commit to this match. Leaving after acceptance may result in a penalty. Please ensure you are ready to play before continuing.':
      'Dengan menerima, Anda berkomitmen pada pertandingan ini. Meninggalkan setelah penerimaan dapat mengakibatkan penalti. Harap pastikan Anda siap bermain sebelum melanjutkan.',
    'CS2 / CSGO crosshair code': 'Kode bidik CS2 / CSGO',
    'CS2 pixel sizes scale with the game resolution. Dynamic spread uses GoldSrc movement and shots. Follow recoil is saved in the share code but is not yet drawn in game.':
      'Ukuran piksel CS2 berskala dengan resolusi game. Penyebaran dinamis menggunakan gerakan dan tembakan GoldSrc. Follow recoil disimpan dalam kode share tetapi belum ditarik dalam game.',
    'Center dot': 'Titik tengah',
    Changelog: 'log perubahan',
    'Changes save automatically. Turn on In-game enhancements in General to use the crosshair during matches.':
      'Perubahan disimpan secara otomatis. Aktifkan peningkatan dalam game secara Umum untuk menggunakan crosshair selama pertandingan.',
    'Checking installation…': 'Memeriksa instalasi…',
    'Checking referral status…': 'Memeriksa status rujukan…',
    'Choose a different installation': 'Pilih instalasi lain',
    'Choose installation folder': 'Pilih folder instalasi',
    'Choose the game folder or its cstrike subfolder. The launcher will find the executable and save your selection automatically.':
      'Pilih folder game atau subfolder cstrike-nya. Peluncur akan menemukan file yang dapat dieksekusi dan menyimpan pilihan Anda secara otomatis.',
    'Code unavailable': 'Kode tidak tersedia',
    Color: 'Warna',
    'Community links': 'Tautan komunitas',
    'Configure browser audio, voice, language, and account credentials.':
      'Konfigurasikan audio browser, suara, bahasa, dan kredensial akun.',
    'Connect Google, Facebook, or Discord so any provider can authenticate this same player account.':
      'Hubungkan Google, Facebook, atau Discord sehingga penyedia mana pun dapat mengautentikasi akun pemain yang sama.',
    Copied: 'Disalin',
    Copy: 'Salin',
    'Copy code': 'Salin kode',
    'Could not save crosshair.': 'Tidak dapat menyimpan crosshair.',
    'Counter-Strike 1.6 on Steam': 'Counter-Strike 1.6 di Uap',
    'Counter-Strike path saved.': 'Jalur Counter-Strike disimpan.',
    Crosshair: 'Garis bidik',
    'Crosshair preview': 'Pratinjau garis bidik',
    'Custom Setup': 'Pengaturan Kustom',
    'Custom crosshairs are available in the desktop launcher. Download it to edit your crosshair and use it in Counter-Strike.':
      'Garis bidik khusus tersedia di peluncur desktop. Unduh untuk mengedit crosshair Anda dan menggunakannya di Counter-Strike.',
    "Custom in-game crosshairs are temporarily disabled while we revise compatibility with different Counter-Strike clients. Your game's normal crosshair remains active.":
      'Garis bidik khusus dalam game untuk sementara dinonaktifkan sementara kami merevisi kompatibilitas dengan klien Counter-Strike yang berbeda. Crosshair normal game Anda tetap aktif.',
    'Desktop client required': 'Diperlukan klien desktop',
    'Desktop only': 'Hanya desktop',
    'Detect installation now': 'Deteksi instalasi sekarang',
    'Detecting Counter-Strike…': 'Mendeteksi Counter-Strike…',
    'Download desktop launcher': 'Unduh peluncur desktop',
    'Downloading installer': 'Mengunduh penginstal',
    'Dynamic gap': 'Kesenjangan dinamis',
    'Enable In-game enhancements in General to use kill cards.':
      'Aktifkan peningkatan dalam game secara Umum untuk menggunakan kartu pembunuh.',
    'Enable animated kill cards': 'Aktifkan kartu pembunuh animasi',
    'Enable fast weapon switch': 'Aktifkan peralihan senjata cepat',
    'Enable in-game enhancements': 'Aktifkan peningkatan dalam game',
    'Enter 1.6 Competitive': 'Masuk 1.6 Kompetitif',
    'Fast weapon switch': 'Peralihan senjata cepat',
    'Finish the Windows installer. We’ll detect the folder you choose.':
      'Selesaikan penginstal Windows. Kami akan mendeteksi folder yang Anda pilih.',
    'Follow & support': 'Ikuti & dukung',
    Full: 'Penuh',
    'Get desktop app': 'Dapatkan aplikasi desktop',
    'Get the desktop client': 'Dapatkan klien desktop',
    'HUD and crosshair': 'HUD dan garis bidik',
    Half: 'Setengah',
    'Import code': 'Impor kode',
    'In-game appearance': 'Penampilan dalam game',
    'In-game enhancements': 'Peningkatan dalam game',
    'Install NextClient': 'Instal Klien Berikutnya',
    'Install NextClient from its official download, or select an existing installation above.':
      'Instal NextClient dari unduhan resminya, atau pilih instalasi yang ada di atas.',
    'Installation folder': 'Folder instalasi',
    'Installation selected': 'Instalasi dipilih',
    'Installer opened': 'Pemasang dibuka',
    'Invalid crosshair code.': 'Kode bidik tidak valid.',
    'Invite a friend': 'Undang teman',
    'Invite friends later using your own code in Settings.':
      'Undang teman nanti menggunakan kode Anda sendiri di Pengaturan.',
    'Loading referral code': 'Memuat kode referensi',
    'NextClient installation could not be selected.':
      'Penginstalan NextClient tidak dapat dipilih.',
    'NextClient requires Windows.': 'Klien Berikutnya memerlukan Windows.',
    'NextClient was not detected. Choose its installation folder.':
      'Klien Berikutnya tidak terdeteksi. Pilih folder instalasinya.',
    'No Counter-Strike folder selected': 'Tidak ada folder Counter-Strike yang dipilih',
    'No installation selected': 'Tidak ada instalasi yang dipilih',
    'No maps are available for this mode': 'Tidak ada peta yang tersedia untuk mode ini',
    'Open Counter-Strike on Steam': 'Buka Counter-Strike di Steam',
    'Open Steam store': 'Buka toko Steam',
    Outline: 'Garis besar',
    'Outline color': 'Warna garis luar',
    'Own the game on Steam, then select its Half-Life folder.':
      'Miliki gamenya di Steam, lalu pilih folder Half-Life-nya.',
    'Paste a CS2 or CSGO code or tune the controls. Changes save automatically for 1.6 Competitive matches.':
      'Tempelkan kode CS2 atau CSGO atau sesuaikan kontrolnya. Perubahan disimpan secara otomatis untuk 1,6 pertandingan Kompetitif.',
    'Paste a CS2 or CSGO crosshair code to import and save it immediately. Older CSGO codes are converted to the current format.':
      'Tempelkan kode crosshair CS2 atau CSGO untuk segera mengimpor dan menyimpannya. Kode CSGO lama dikonversi ke format saat ini.',
    'Preparing your lobby…': 'Mempersiapkan lobi Anda…',
    Recommended: 'Direkomendasikan',
    'Recommended Setup': 'Pengaturan yang Direkomendasikan',
    'Referral code already used on this account.': 'Kode referensi sudah digunakan pada akun ini.',
    'Reopen browser': 'Buka kembali peramban',
    'Required match files are checked before each game launches. You can change the installation and features in Settings later.':
      'File kecocokan yang diperlukan diperiksa sebelum setiap game diluncurkan. Anda dapat mengubah instalasi dan fitur di Pengaturan nanti.',
    'Restore recommended': 'Pemulihan direkomendasikan',
    'Retry detection': 'Coba lagi deteksi',
    'Retry installer': 'Coba lagi penginstal',
    'Retry save': 'Coba simpan lagi',
    'Save your Counter-Strike folder above before downloading assets.':
      'Simpan folder Counter-Strike Anda di atas sebelum mengunduh aset.',
    'Saving your setup…': 'Menyimpan penyiapan Anda…',
    'Select the code above to copy it manually.':
      'Pilih kode di atas untuk menyalinnya secara manual.',
    'Select weapons immediately with number keys. Custom Setup leaves your game preference alone until you change this switch.':
      'Pilih senjata segera dengan tombol angka. Pengaturan Kustom membiarkan preferensi permainan Anda sendiri sampai Anda mengubah tombol ini.',
    'Set up your Counter-Strike 1.6 folder before reconnecting to the match.':
      'Siapkan folder Counter-Strike 1.6 Anda sebelum menghubungkan kembali ke pertandingan.',
    'Setup preference': 'Preferensi pengaturan',
    'Share your referral code. When a friend uses it, you both receive rewards.':
      'Bagikan kode referensi Anda. Saat seorang teman menggunakannya, Anda berdua menerima hadiah.',
    'Show an animated card for each kill above the round timer. The last card is ACE in 3v3 or 5v5. FFA stacks up to 16 cards without ACE.':
      'Tampilkan kartu animasi untuk setiap pembunuhan di atas pengatur waktu putaran. Kartu terakhir adalah ACE dalam 3v3 atau 5v5. FFA menumpuk hingga 16 kartu tanpa ACE.',
    'Show the 1.6 Competitive scoreboard, crosshair, teammate tags, and kill cards in supported Counter-Strike 1.6 clients on Steam and standalone installations on Windows or Linux. NextClient uses its own compatible host and crosshair settings. Game files are restored after exit. This setting does not control match screenshot review.':
      'Tampilkan papan skor 1.6 Competitive, bidikan, penanda rekan tim, dan kartu kill pada klien Counter-Strike 1.6 yang didukung di Steam atau instalasi mandiri Windows dan Linux. NextClient menggunakan pengaturannya sendiri yang kompatibel. File game dipulihkan setelah keluar. Pengaturan ini tidak memengaruhi peninjauan tangkapan layar pertandingan.',
    'Skip for now': 'Lewati untuk saat ini',
    'Streamed from your region': 'Dialirkan dari wilayah Anda',
    Style: 'Gaya',
    'The web app streams managed skin and model assets from the selected regional server. There is no launcher asset folder to download or repair.':
      'Aplikasi web mengalirkan aset skin dan model terkelola dari server regional yang dipilih. Tidak ada folder aset peluncur untuk diunduh atau diperbaiki.',
    'This game mode is not available for Web Play. Choose another mode or use a desktop-only party.':
      'Mode permainan ini tidak tersedia untuk Web Play. Pilih mode lain atau gunakan pesta khusus desktop.',
    'This mode is unavailable for Web Play or mixed parties':
      'Mode ini tidak tersedia untuk Web Play atau pesta campuran',
    'This mode is unavailable for Web Play or mixed parties.':
      'Mode ini tidak tersedia untuk Web Play atau pesta campuran.',
    'Use CS2 controls': 'Gunakan kontrol CS2',
    'Using your game preference': 'Menggunakan preferensi permainan Anda',
    'Waiting for a folder…': 'Menunggu folder…',
    'Web Play party: the leader can choose modes enabled for browser players.':
      'Pesta Web Play: pemimpin dapat memilih mode yang diaktifkan untuk pemain browser.',
    'Windows only': 'Hanya jendela',
    "You're all set": 'Anda sudah siap',
    'Your first-run preference. You can adjust each feature below.':
      'Preferensi pertama kali Anda jalankan. Anda dapat menyesuaikan setiap fitur di bawah ini.',
    'Your personal Counter-Strike settings stay yours.':
      'Pengaturan Counter-Strike pribadi Anda tetap menjadi milik Anda.',
    'Your setup is saved. Entering the launcher now.':
      'Pengaturan Anda telah disimpan. Memasuki peluncur sekarang.',
    '3–32 characters: letters, numbers, and underscores.':
      '3–32 karakter: huruf, angka, dan garis bawah.',
    'Add a password to enable username/password login for this account.':
      'Tambahkan kata sandi untuk mengaktifkan login nama pengguna/kata sandi untuk akun ini.',
    'Asset maintenance is unavailable while matchmaking or a match is active.':
      'Pemeliharaan aset tidak tersedia saat perjodohan atau pertandingan aktif.',
    'Assets have not been checked this session.': 'Aset belum diperiksa pada sesi ini.',
    Back: 'Kembali',
    'Check, download, or repair the managed game assets used by 1.6 Competitive.':
      'Periksa, unduh, atau perbaiki aset game terkelola yang digunakan oleh 1.6 Kompetitif.',
    'Choose a music set for the launcher. Each set can provide its own background music and match-found cue.':
      'Pilih kumpulan musik untuk peluncur. Setiap set dapat memberikan musik latar dan isyarat kecocokannya sendiri.',
    Close: 'Tutup',
    'Configure the game client, manage downloaded assets, and update your account credentials.':
      'Konfigurasikan klien game, kelola aset yang diunduh, dan perbarui kredensial akun Anda.',
    'Configure voice bindings, launcher music, and interface sound effects.':
      'Konfigurasikan pengikatan suara, musik peluncur, dan efek suara antarmuka.',
    'Control launcher music and interface sounds. These preferences are saved on this device.':
      'Kontrol musik peluncur dan suara antarmuka. Preferensi ini disimpan di perangkat ini.',
    'Download missing 1.6 Competitive models before matchmaking. Repair removes managed copies and downloads them again if local assets are damaged.':
      'Unduh model Kompetitif 1.6 yang hilang sebelum perjodohan. Perbaikan menghapus salinan terkelola dan mengunduhnya lagi jika aset lokal rusak.',
    'Game client': 'Klien permainan',
    'Installation found': 'Instalasi ditemukan',
    Launcher: 'Peluncur',
    'Manage your username, sign-in methods, and password.':
      'Kelola nama pengguna, metode masuk, dan kata sandi Anda.',
    'No installation': 'Tidak ada instalasi',
    None: 'Tidak ada',
    Retry: 'Coba lagi',
    'Verify your password before replacing it.': 'Verifikasi kata sandi Anda sebelum menggantinya.',
    'Visible to other players. You can change it once every 7 days.':
      'Terlihat oleh pemain lain. Anda dapat mengubahnya setiap 7 hari sekali.',
    'COUNTER-STRIKE 1.6 WEB PLAY': 'MAIN WEB COUNTER-STRIKE 1.6',
    'Web Play modes vary. Ranked 5v5 and exclusive launcher features require the desktop client.':
      'Mode Web Play bervariasi. Peringkat 5v5 dan fitur peluncur eksklusif memerlukan klien desktop.'
  },
  hi: {
    '1.6 Competitive by Papamo reserves this mode for desktop players. Everyone in your party must use the desktop client before the leader can queue.':
      'Papamo का 1.6 Competitive इस मोड को डेस्कटॉप खिलाड़ियों के लिए रखता है। लीडर के कतार में शामिल होने से पहले पार्टी के सभी सदस्यों को डेस्कटॉप क्लाइंट इस्तेमाल करना होगा।',
    '1.6 Competitive settings': '1.6 Competitive सेटिंग्स',
    'Animated kill cards': 'एनिमेटेड किल कार्ड',
    'Apply code': 'कोड लागू करें',
    'Applying referral code…': 'रेफरल कोड लागू किया जा रहा है...',
    'Assets & previews': 'संपत्ति और पूर्वावलोकन',
    'Back to website': 'वेबसाइट पर वापस जाएँ',
    'Browser matches launch the Steam copy of Counter-Strike directly. You do not need to choose a local game folder or install launcher-managed files.':
      'ब्राउज़र मैच सीधे काउंटर-स्ट्राइक की स्टीम कॉपी लॉन्च करते हैं। आपको स्थानीय गेम फ़ोल्डर चुनने या लॉन्चर-प्रबंधित फ़ाइलें इंस्टॉल करने की आवश्यकता नहीं है।',
    'By accepting, you commit to this match. Leaving after acceptance may result in a penalty. Please ensure you are ready to play before continuing.':
      'स्वीकार करके, आप इस मैच के लिए प्रतिबद्ध हैं। स्वीकृति के बाद छोड़ने पर जुर्माना लग सकता है। कृपया सुनिश्चित करें कि आप जारी रखने से पहले खेलने के लिए तैयार हैं।',
    'CS2 / CSGO crosshair code': 'CS2 / CSGO क्रॉसहेयर कोड',
    'CS2 pixel sizes scale with the game resolution. Dynamic spread uses GoldSrc movement and shots. Follow recoil is saved in the share code but is not yet drawn in game.':
      'गेम रिज़ॉल्यूशन के साथ CS2 पिक्सेल आकार स्केल। डायनामिक स्प्रेड गोल्डएसआरसी मूवमेंट और शॉट्स का उपयोग करता है। फ़ॉलो रिकॉइल शेयर कोड में सहेजा गया है लेकिन अभी तक गेम में नहीं आया है।',
    'Center dot': 'केंद्र बिंदु',
    Changelog: 'चेंजलॉग',
    'Changes save automatically. Turn on In-game enhancements in General to use the crosshair during matches.':
      'परिवर्तन स्वचालित रूप से सहेजे जाते हैं. मैचों के दौरान क्रॉसहेयर का उपयोग करने के लिए सामान्य रूप से इन-गेम एन्हांसमेंट चालू करें।',
    'Checking installation…': 'इंस्टालेशन की जाँच हो रही है…',
    'Checking referral status…': 'रेफरल स्थिति की जाँच की जा रही है…',
    'Choose a different installation': 'कोई भिन्न स्थापना चुनें',
    'Choose installation folder': 'इंस्टॉलेशन फ़ोल्डर चुनें',
    'Choose the game folder or its cstrike subfolder. The launcher will find the executable and save your selection automatically.':
      'गेम फ़ोल्डर या उसका cstrike सबफ़ोल्डर चुनें। लॉन्चर निष्पादन योग्य ढूंढ लेगा और आपके चयन को स्वचालित रूप से सहेज लेगा।',
    'Code unavailable': 'कोड अनुपलब्ध',
    Color: 'रंग',
    'Community links': 'सामुदायिक लिंक',
    'Configure browser audio, voice, language, and account credentials.':
      'ब्राउज़र ऑडियो, आवाज, भाषा और खाता क्रेडेंशियल कॉन्फ़िगर करें।',
    'Connect Google, Facebook, or Discord so any provider can authenticate this same player account.':
      'Google, Facebook, या Discord को कनेक्ट करें ताकि कोई भी प्रदाता इसी प्लेयर खाते को प्रमाणित कर सके।',
    Copied: 'नकल की गई',
    Copy: 'प्रतिलिपि',
    'Copy code': 'कोड कॉपी करें',
    'Could not save crosshair.': 'क्रॉसहेयर सहेजा नहीं जा सका.',
    'Counter-Strike 1.6 on Steam': 'स्टीम पर काउंटर-स्ट्राइक 1.6',
    'Counter-Strike path saved.': 'जवाबी हमला पथ सहेजा गया.',
    Crosshair: 'क्रॉसहेयर',
    'Crosshair preview': 'क्रॉसहेयर पूर्वावलोकन',
    'Custom Setup': 'कस्टम सेटअप',
    'Custom crosshairs are available in the desktop launcher. Download it to edit your crosshair and use it in Counter-Strike.':
      'डेस्कटॉप लॉन्चर में कस्टम क्रॉसहेयर उपलब्ध हैं। अपने क्रॉसहेयर को संपादित करने के लिए इसे डाउनलोड करें और काउंटर-स्ट्राइक में इसका उपयोग करें।',
    "Custom in-game crosshairs are temporarily disabled while we revise compatibility with different Counter-Strike clients. Your game's normal crosshair remains active.":
      'जब हम विभिन्न काउंटर-स्ट्राइक क्लाइंट के साथ संगतता को संशोधित करते हैं तो कस्टम इन-गेम क्रॉसहेयर अस्थायी रूप से अक्षम हो जाते हैं। आपके गेम का सामान्य क्रॉसहेयर सक्रिय रहता है।',
    'Desktop client required': 'डेस्कटॉप क्लाइंट की आवश्यकता है',
    'Desktop only': 'केवल डेस्कटॉप',
    'Detect installation now': 'अभी इंस्टालेशन का पता लगाएं',
    'Detecting Counter-Strike…': 'जवाबी हमले का पता लगाना...',
    'Download desktop launcher': 'डेस्कटॉप लॉन्चर डाउनलोड करें',
    'Downloading installer': 'इंस्टॉलर डाउनलोड हो रहा है',
    'Dynamic gap': 'गतिशील अंतराल',
    'Enable In-game enhancements in General to use kill cards.':
      'किल कार्ड का उपयोग करने के लिए सामान्य रूप से इन-गेम एन्हांसमेंट सक्षम करें।',
    'Enable animated kill cards': 'एनिमेटेड किल कार्ड सक्षम करें',
    'Enable fast weapon switch': 'तेज़ हथियार स्विच सक्षम करें',
    'Enable in-game enhancements': 'इन-गेम संवर्द्धन सक्षम करें',
    'Enter 1.6 Competitive': '1.6 प्रतिस्पर्धी दर्ज करें',
    'Fast weapon switch': 'तेज़ हथियार स्विच',
    'Finish the Windows installer. We’ll detect the folder you choose.':
      'Windows इंस्टालर समाप्त करें. हम आपके द्वारा चुने गए फ़ोल्डर का पता लगा लेंगे।',
    'Follow & support': 'अनुसरण करें और समर्थन करें',
    Full: 'पूर्ण',
    'Get desktop app': 'डेस्कटॉप ऐप प्राप्त करें',
    'Get the desktop client': 'डेस्कटॉप क्लाइंट प्राप्त करें',
    'HUD and crosshair': 'HUD और क्रॉसहेयर',
    Half: 'आधा',
    'Import code': 'कोड आयात करें',
    'In-game appearance': 'खेल में उपस्थिति',
    'In-game enhancements': 'इन-गेम संवर्द्धन',
    'Install NextClient': 'नेक्स्टक्लाइंट स्थापित करें',
    'Install NextClient from its official download, or select an existing installation above.':
      'नेक्स्टक्लाइंट को इसके आधिकारिक डाउनलोड से इंस्टॉल करें, या ऊपर मौजूदा इंस्टॉलेशन का चयन करें।',
    'Installation folder': 'स्थापना फ़ोल्डर',
    'Installation selected': 'स्थापना चयनित',
    'Installer opened': 'इंस्टॉलर खोला गया',
    'Invalid crosshair code.': 'अमान्य क्रॉसहेयर कोड.',
    'Invite a friend': 'किसी मित्र को आमंत्रित करें',
    'Invite friends later using your own code in Settings.':
      'बाद में सेटिंग्स में अपने कोड का उपयोग करके मित्रों को आमंत्रित करें।',
    'Loading referral code': 'रेफरल कोड लोड हो रहा है',
    'NextClient installation could not be selected.':
      'नेक्स्टक्लाइंट इंस्टॉलेशन का चयन नहीं किया जा सका.',
    'NextClient requires Windows.': 'नेक्स्टक्लाइंट को विंडोज़ की आवश्यकता है।',
    'NextClient was not detected. Choose its installation folder.':
      'NextClient का पता नहीं चला. इसका इंस्टॉलेशन फ़ोल्डर चुनें.',
    'No Counter-Strike folder selected': 'कोई काउंटर-स्ट्राइक फ़ोल्डर चयनित नहीं है',
    'No installation selected': 'कोई इंस्टालेशन चयनित नहीं',
    'No maps are available for this mode': 'इस मोड के लिए कोई मानचित्र उपलब्ध नहीं हैं',
    'Open Counter-Strike on Steam': 'स्टीम पर काउंटर-स्ट्राइक खोलें',
    'Open Steam store': 'स्टीम स्टोर खोलें',
    Outline: 'रूपरेखा',
    'Outline color': 'रूपरेखा का रंग',
    'Own the game on Steam, then select its Half-Life folder.':
      'स्टीम पर गेम का स्वामी बनें, फिर उसका हाफ-लाइफ फ़ोल्डर चुनें।',
    'Paste a CS2 or CSGO code or tune the controls. Changes save automatically for 1.6 Competitive matches.':
      'CS2 या CSGO कोड चिपकाएँ या नियंत्रणों को ट्यून करें। 1.6 प्रतिस्पर्धी मैचों के लिए परिवर्तन स्वचालित रूप से सहेजे जाते हैं।',
    'Paste a CS2 or CSGO crosshair code to import and save it immediately. Older CSGO codes are converted to the current format.':
      'इसे तुरंत आयात करने और सहेजने के लिए CS2 या CSGO क्रॉसहेयर कोड चिपकाएँ। पुराने सीएसजीओ कोड को वर्तमान प्रारूप में परिवर्तित कर दिया गया है।',
    'Preparing your lobby…': 'आपकी लॉबी तैयार की जा रही है...',
    Recommended: 'अनुशंसित',
    'Recommended Setup': 'अनुशंसित सेटअप',
    'Referral code already used on this account.':
      'इस खाते पर रेफरल कोड पहले से ही उपयोग किया गया है।',
    'Reopen browser': 'ब्राउज़र पुनः खोलें',
    'Required match files are checked before each game launches. You can change the installation and features in Settings later.':
      'प्रत्येक गेम लॉन्च होने से पहले आवश्यक मिलान फ़ाइलों की जाँच की जाती है। आप बाद में सेटिंग्स में इंस्टॉलेशन और सुविधाओं को बदल सकते हैं।',
    'Restore recommended': 'पुनर्स्थापित करने की अनुशंसा की गई',
    'Retry detection': 'पता लगाने का पुनः प्रयास करें',
    'Retry installer': 'इंस्टॉलर पुनः प्रयास करें',
    'Retry save': 'सहेजने का पुनः प्रयास करें',
    'Save your Counter-Strike folder above before downloading assets.':
      'संपत्ति डाउनलोड करने से पहले अपना काउंटर-स्ट्राइक फ़ोल्डर ऊपर सहेजें।',
    'Saving your setup…': 'आपका सेटअप सहेजा जा रहा है...',
    'Select the code above to copy it manually.':
      'इसे मैन्युअल रूप से कॉपी करने के लिए उपरोक्त कोड का चयन करें।',
    'Select weapons immediately with number keys. Custom Setup leaves your game preference alone until you change this switch.':
      'नंबर कुंजियों के साथ तुरंत हथियार चुनें। जब तक आप इस स्विच को नहीं बदलते तब तक कस्टम सेटअप आपकी गेम प्राथमिकता को अकेला छोड़ देता है।',
    'Set up your Counter-Strike 1.6 folder before reconnecting to the match.':
      'मैच से पुनः कनेक्ट करने से पहले अपना काउंटर-स्ट्राइक 1.6 फ़ोल्डर सेट करें।',
    'Setup preference': 'सेटअप प्राथमिकता',
    'Share your referral code. When a friend uses it, you both receive rewards.':
      'अपना रेफरल कोड साझा करें. जब कोई मित्र इसका उपयोग करता है, तो आप दोनों को पुरस्कार मिलते हैं।',
    'Show an animated card for each kill above the round timer. The last card is ACE in 3v3 or 5v5. FFA stacks up to 16 cards without ACE.':
      'राउंड टाइमर के ऊपर प्रत्येक किल के लिए एक एनिमेटेड कार्ड दिखाएं। अंतिम कार्ड 3v3 या 5v5 में ACE है। एफएफए में एसीई के बिना 16 कार्ड तक जमा हो जाते हैं।',
    'Show the 1.6 Competitive scoreboard, crosshair, teammate tags, and kill cards in supported Counter-Strike 1.6 clients on Steam and standalone installations on Windows or Linux. NextClient uses its own compatible host and crosshair settings. Game files are restored after exit. This setting does not control match screenshot review.':
      'Steam और Windows या Linux की स्वतंत्र इंस्टॉलेशन पर समर्थित Counter-Strike 1.6 क्लाइंट में 1.6 Competitive स्कोरबोर्ड, क्रॉसहेयर, टीममेट टैग और किल कार्ड दिखाएँ। NextClient अपनी संगत सेटिंग्स का उपयोग करता है। गेम से बाहर निकलने पर फाइलें बहाल हो जाती हैं। यह सेटिंग मैच के स्क्रीनशॉट की समीक्षा को नियंत्रित नहीं करती।',
    'Skip for now': 'अभी के लिए छोड़ें',
    'Streamed from your region': 'आपके क्षेत्र से स्ट्रीम किया गया',
    Style: 'अंदाज',
    'The web app streams managed skin and model assets from the selected regional server. There is no launcher asset folder to download or repair.':
      'वेब ऐप चयनित क्षेत्रीय सर्वर से प्रबंधित त्वचा और मॉडल संपत्तियों को स्ट्रीम करता है। डाउनलोड करने या सुधारने के लिए कोई लॉन्चर एसेट फ़ोल्डर नहीं है।',
    'This game mode is not available for Web Play. Choose another mode or use a desktop-only party.':
      'यह गेम मोड वेब प्ले के लिए उपलब्ध नहीं है. कोई अन्य मोड चुनें या केवल-डेस्कटॉप पार्टी का उपयोग करें।',
    'This mode is unavailable for Web Play or mixed parties':
      'यह मोड वेब प्ले या मिश्रित पार्टियों के लिए उपलब्ध नहीं है',
    'This mode is unavailable for Web Play or mixed parties.':
      'यह मोड वेब प्ले या मिश्रित पार्टियों के लिए उपलब्ध नहीं है।',
    'Use CS2 controls': 'CS2 नियंत्रणों का उपयोग करें',
    'Using your game preference': 'अपनी खेल प्राथमिकता का उपयोग करना',
    'Waiting for a folder…': 'किसी फ़ोल्डर की प्रतीक्षा की जा रही है...',
    'Web Play party: the leader can choose modes enabled for browser players.':
      'वेब प्ले पार्टी: लीडर ब्राउज़र प्लेयर्स के लिए सक्षम मोड चुन सकता है।',
    'Windows only': 'केवल विंडोज़',
    "You're all set": 'आप पूरी तरह तैयार हैं',
    'Your first-run preference. You can adjust each feature below.':
      'आपकी पहली प्राथमिकता. आप नीचे प्रत्येक सुविधा को समायोजित कर सकते हैं.',
    'Your personal Counter-Strike settings stay yours.':
      'आपकी व्यक्तिगत काउंटर-स्ट्राइक सेटिंग्स आपकी ही रहेंगी।',
    'Your setup is saved. Entering the launcher now.':
      'आपका सेटअप सहेजा गया है. अब लॉन्चर में प्रवेश कर रहा हूँ।',
    '3–32 characters: letters, numbers, and underscores.':
      '3-32 अक्षर: अक्षर, संख्याएँ और अंडरस्कोर।',
    'Add a password to enable username/password login for this account.':
      'इस खाते के लिए उपयोगकर्ता नाम/पासवर्ड लॉगिन सक्षम करने के लिए एक पासवर्ड जोड़ें।',
    'Asset maintenance is unavailable while matchmaking or a match is active.':
      'मंगनी या मंगनी सक्रिय होने पर संपत्ति का रखरखाव उपलब्ध नहीं है।',
    'Assets are up to date': 'संपत्तियां अद्यतन हैं',
    'Assets have not been checked this session.': 'इस सत्र में संपत्ति की जांच नहीं की गयी है.',
    Back: 'वापस',
    'Check, download, or repair the managed game assets used by 1.6 Competitive.':
      '1.6 प्रतिस्पर्धी द्वारा उपयोग की जाने वाली प्रबंधित गेम संपत्तियों की जांच करें, डाउनलोड करें या मरम्मत करें।',
    'Checking skin assets…': 'त्वचा परिसंपत्तियों की जाँच की जा रही है...',
    'Choose a music set for the launcher. Each set can provide its own background music and match-found cue.':
      'लॉन्चर के लिए एक संगीत सेट चुनें. प्रत्येक सेट अपना स्वयं का पृष्ठभूमि संगीत और मैच-फ़ाउंड संकेत प्रदान कर सकता है।',
    Close: 'बंद करें',
    'Configure the game client, manage downloaded assets, and update your account credentials.':
      'गेम क्लाइंट को कॉन्फ़िगर करें, डाउनलोड की गई संपत्तियों को प्रबंधित करें, और अपने खाता क्रेडेंशियल्स को अपडेट करें।',
    'Configure voice bindings, launcher music, and interface sound effects.':
      'वॉयस बाइंडिंग, लॉन्चर संगीत और इंटरफ़ेस ध्वनि प्रभाव कॉन्फ़िगर करें।',
    'Control launcher music and interface sounds. These preferences are saved on this device.':
      'लॉन्चर संगीत और इंटरफ़ेस ध्वनियों को नियंत्रित करें। ये प्राथमिकताएँ इस डिवाइस पर सहेजी गई हैं।',
    'Could not sync skin assets.': 'त्वचा संपत्तियों को सिंक नहीं किया जा सका.',
    'Download assets': 'संपत्ति डाउनलोड करें',
    'Download missing 1.6 Competitive models before matchmaking. Repair removes managed copies and downloads them again if local assets are damaged.':
      'मंगनी से पहले लापता 1.6 प्रतिस्पर्धी मॉडल डाउनलोड करें। यदि स्थानीय संपत्तियाँ क्षतिग्रस्त हो जाती हैं, तो मरम्मत प्रबंधित प्रतियों को हटा देती है और उन्हें फिर से डाउनलोड करती है।',
    'Game assets': 'खेल संपत्ति',
    'Installation found': 'इंस्टालेशन मिला',
    Launcher: 'लॉन्चर',
    'No installation': 'कोई स्थापना नहीं',
    None: 'कोई नहीं',
    'Preparing asset download': 'संपत्ति डाउनलोड की तैयारी',
    'Repair assets': 'संपत्तियों की मरम्मत करें',
    'Repairing skin assets…': 'त्वचा संपत्तियों की मरम्मत…',
    Retry: 'पुनः प्रयास करें',
    'Skin asset download progress': 'त्वचा संपत्ति डाउनलोड प्रगति',
    'Verify your password before replacing it.': 'अपना पासवर्ड बदलने से पहले उसे सत्यापित करें.',
    'Visible to other players. You can change it once every 7 days.':
      'अन्य खिलाड़ियों के लिए दृश्यमान. आप इसे हर 7 दिन में एक बार बदल सकते हैं।',
    'COUNTER-STRIKE 1.6 WEB PLAY': 'काउंटर-स्ट्राइक 1.6 वेब प्ले',
    'Web Play modes vary. Ranked 5v5 and exclusive launcher features require the desktop client.':
      'Web Play मोड भिन्न-भिन्न होते हैं। 5v5 रैंक और विशिष्ट लॉन्चर सुविधाओं के लिए डेस्कटॉप क्लाइंट की आवश्यकता होती है।'
  },
  pt: {
    '1.6 Competitive by Papamo reserves this mode for desktop players. Everyone in your party must use the desktop client before the leader can queue.':
      '1.6 Competitive by Papamo reserva este modo para jogadores de desktop. Todos no seu grupo devem usar o cliente de desktop antes que o líder possa entrar na fila.',
    '1.6 Competitive settings': 'Configurações do 1.6 Competitive',
    'Animated kill cards': 'Cartões de morte animados',
    'Apply code': 'Aplicar código',
    'Applying referral code…': 'Aplicando código de referência…',
    'Assets & previews': 'Recursos e visualizações',
    'Back to website': 'Voltar ao site',
    'Browser matches launch the Steam copy of Counter-Strike directly. You do not need to choose a local game folder or install launcher-managed files.':
      'As partidas do navegador iniciam a cópia Steam do Counter-Strike diretamente. Você não precisa escolher uma pasta local do jogo ou instalar arquivos gerenciados pelo inicializador.',
    'By accepting, you commit to this match. Leaving after acceptance may result in a penalty. Please ensure you are ready to play before continuing.':
      'Ao aceitar, você se compromete com esta partida. Sair após a aceitação pode resultar em penalidade. Certifique-se de que está pronto para jogar antes de continuar.',
    'CS2 / CSGO crosshair code': 'Código de mira CS2 / CSGO',
    'CS2 pixel sizes scale with the game resolution. Dynamic spread uses GoldSrc movement and shots. Follow recoil is saved in the share code but is not yet drawn in game.':
      'Os tamanhos de pixel do CS2 são dimensionados de acordo com a resolução do jogo. A propagação dinâmica usa movimentos e tiros GoldSrc. O recuo seguinte é salvo no código de compartilhamento, mas ainda não foi sorteado no jogo.',
    'Center dot': 'Ponto central',
    Changelog: 'Registro de alterações',
    'Changes save automatically. Turn on In-game enhancements in General to use the crosshair during matches.':
      'As alterações são salvas automaticamente. Ative as melhorias gerais do jogo para usar a mira durante as partidas.',
    'Checking installation…': 'Verificando a instalação…',
    'Checking referral status…': 'Verificando o status da indicação…',
    'Choose a different installation': 'Escolha uma instalação diferente',
    'Choose installation folder': 'Escolha a pasta de instalação',
    'Choose the game folder or its cstrike subfolder. The launcher will find the executable and save your selection automatically.':
      'Escolha a pasta do jogo ou sua subpasta cstrike. O inicializador encontrará o executável e salvará sua seleção automaticamente.',
    'Code unavailable': 'Código indisponível',
    Color: 'Cor',
    'Community links': 'Links da comunidade',
    'Configure browser audio, voice, language, and account credentials.':
      'Configure o áudio, a voz, o idioma e as credenciais da conta do navegador.',
    'Connect Google, Facebook, or Discord so any provider can authenticate this same player account.':
      'Conecte Google, Facebook ou Discord para que qualquer provedor possa autenticar a mesma conta de jogador.',
    Copied: 'Copiado',
    Copy: 'Copiar',
    'Copy code': 'Copiar código',
    'Could not save crosshair.': 'Não foi possível salvar a mira.',
    'Counter-Strike 1.6 on Steam': 'Counter-Strike 1.6 no Steam',
    'Counter-Strike path saved.': 'Caminho do Counter-Strike salvo.',
    Crosshair: 'Mira',
    'Crosshair preview': 'Pré-visualização da mira',
    'Custom Setup': 'Configuração personalizada',
    'Custom crosshairs are available in the desktop launcher. Download it to edit your crosshair and use it in Counter-Strike.':
      'Miras personalizadas estão disponíveis no inicializador da área de trabalho. Baixe-o para editar sua mira e usá-la no Counter-Strike.',
    "Custom in-game crosshairs are temporarily disabled while we revise compatibility with different Counter-Strike clients. Your game's normal crosshair remains active.":
      'As miras personalizadas no jogo estão temporariamente desativadas enquanto revisamos a compatibilidade com diferentes clientes do Counter-Strike. A mira normal do seu jogo permanece ativa.',
    'Desktop client required': 'Cliente de desktop necessário',
    'Desktop only': 'Somente desktop',
    'Detect installation now': 'Detectar instalação agora',
    'Detecting Counter-Strike…': 'Detectando Counter-Strike…',
    'Download desktop launcher': 'Baixe o iniciador da área de trabalho',
    'Downloading installer': 'Baixando o instalador',
    'Dynamic gap': 'Lacuna dinâmica',
    'Enable In-game enhancements in General to use kill cards.':
      'Habilite melhorias no jogo em geral para usar cartas de morte.',
    'Enable animated kill cards': 'Habilitar cartas de morte animadas',
    'Enable fast weapon switch': 'Habilitar troca rápida de arma',
    'Enable in-game enhancements': 'Habilite melhorias no jogo',
    'Enter 1.6 Competitive': 'Entre no 1.6 Competitivo',
    'Fast weapon switch': 'Troca rápida de arma',
    'Finish the Windows installer. We’ll detect the folder you choose.':
      'Conclua o instalador do Windows. Detectaremos a pasta que você escolher.',
    'Follow & support': 'Siga e apoie',
    Full: 'Completo',
    'Get desktop app': 'Obtenha o aplicativo para desktop',
    'Get the desktop client': 'Obtenha o cliente de desktop',
    'HUD and crosshair': 'HUD e mira',
    Half: 'Metade',
    'Import code': 'Código de importação',
    'In-game appearance': 'Aparência no jogo',
    'In-game enhancements': 'Melhorias no jogo',
    'Install NextClient': 'Instale o NextClient',
    'Install NextClient from its official download, or select an existing installation above.':
      'Instale o NextClient a partir de seu download oficial ou selecione uma instalação existente acima.',
    'Installation folder': 'Pasta de instalação',
    'Installation selected': 'Instalação selecionada',
    'Installer opened': 'Instalador aberto',
    'Invalid crosshair code.': 'Código de mira inválido.',
    'Invite a friend': 'Convide um amigo',
    'Invite friends later using your own code in Settings.':
      'Convide amigos mais tarde usando seu próprio código em Configurações.',
    'Loading referral code': 'Carregando código de referência',
    'NextClient installation could not be selected.':
      'A instalação do NextClient não pôde ser selecionada.',
    'NextClient requires Windows.': 'NextClient requer Windows.',
    'NextClient was not detected. Choose its installation folder.':
      'NextClient não foi detectado. Escolha sua pasta de instalação.',
    'No Counter-Strike folder selected': 'Nenhuma pasta do Counter-Strike selecionada',
    'No installation selected': 'Nenhuma instalação selecionada',
    'No maps are available for this mode': 'Nenhum mapa está disponível para este modo',
    'Open Counter-Strike on Steam': 'Abra o Counter-Strike no Steam',
    'Open Steam store': 'Abra a loja Steam',
    Outline: 'Esboço',
    'Outline color': 'Cor do contorno',
    'Own the game on Steam, then select its Half-Life folder.':
      'Adquira o jogo no Steam e selecione a pasta Half-Life.',
    'Paste a CS2 or CSGO code or tune the controls. Changes save automatically for 1.6 Competitive matches.':
      'Cole um código CS2 ou CSGO ou ajuste os controles. As alterações são salvas automaticamente para partidas 1.6 Competitivas.',
    'Paste a CS2 or CSGO crosshair code to import and save it immediately. Older CSGO codes are converted to the current format.':
      'Cole um código de mira CS2 ou CSGO para importar e salve-o imediatamente. Os códigos CSGO mais antigos são convertidos para o formato atual.',
    'Preparing your lobby…': 'Preparando seu lobby…',
    Recommended: 'Recomendado',
    'Recommended Setup': 'Configuração recomendada',
    'Referral code already used on this account.': 'Código de referência já utilizado nesta conta.',
    'Reopen browser': 'Reabrir navegador',
    'Required match files are checked before each game launches. You can change the installation and features in Settings later.':
      'Os arquivos de correspondência necessários são verificados antes do lançamento de cada jogo. Você pode alterar a instalação e os recursos em Configurações posteriormente.',
    'Restore recommended': 'Restauração recomendada',
    'Retry detection': 'Tentar novamente a detecção',
    'Retry installer': 'Tentar novamente o instalador',
    'Retry save': 'Tentar salvar novamente',
    'Save your Counter-Strike folder above before downloading assets.':
      'Salve sua pasta Counter-Strike acima antes de baixar os ativos.',
    'Saving your setup…': 'Salvando sua configuração…',
    'Select the code above to copy it manually.':
      'Selecione o código acima para copiá-lo manualmente.',
    'Select weapons immediately with number keys. Custom Setup leaves your game preference alone until you change this switch.':
      'Selecione as armas imediatamente com as teclas numéricas. A configuração personalizada deixa sua preferência de jogo em paz até que você altere essa opção.',
    'Set up your Counter-Strike 1.6 folder before reconnecting to the match.':
      'Configure sua pasta Counter-Strike 1.6 antes de se reconectar à partida.',
    'Setup preference': 'Preferência de configuração',
    'Share your referral code. When a friend uses it, you both receive rewards.':
      'Compartilhe seu código de referência. Quando um amigo o usa, vocês dois recebem recompensas.',
    'Show an animated card for each kill above the round timer. The last card is ACE in 3v3 or 5v5. FFA stacks up to 16 cards without ACE.':
      'Mostre um cartão animado para cada morte acima do cronômetro da rodada. A última carta é ACE em 3v3 ou 5v5. FFA empilha até 16 cartas sem ACE.',
    'Show the 1.6 Competitive scoreboard, crosshair, teammate tags, and kill cards in supported Counter-Strike 1.6 clients on Steam and standalone installations on Windows or Linux. NextClient uses its own compatible host and crosshair settings. Game files are restored after exit. This setting does not control match screenshot review.':
      'Mostre o placar do 1.6 Competitive, a mira, as marcas dos colegas de equipe e os cartões de eliminação em clientes compatíveis do Counter-Strike 1.6 no Steam ou em instalações independentes no Windows e Linux. O NextClient usa suas próprias configurações compatíveis. Os arquivos do jogo são restaurados ao sair. Esta opção não controla a análise de capturas de tela da partida.',
    'Skip for now': 'Pular por enquanto',
    'Streamed from your region': 'Transmitido da sua região',
    Style: 'Estilo',
    'The web app streams managed skin and model assets from the selected regional server. There is no launcher asset folder to download or repair.':
      'O aplicativo da web transmite ativos de skin e modelo gerenciados do servidor regional selecionado. Não há pasta de ativos do iniciador para baixar ou reparar.',
    'This game mode is not available for Web Play. Choose another mode or use a desktop-only party.':
      'Este modo de jogo não está disponível para Web Play. Escolha outro modo ou use uma festa apenas no desktop.',
    'This mode is unavailable for Web Play or mixed parties':
      'Este modo não está disponível para Web Play ou grupos mistos',
    'This mode is unavailable for Web Play or mixed parties.':
      'Este modo não está disponível para Web Play ou grupos mistos.',
    'Use CS2 controls': 'Usar controles CS2',
    'Using your game preference': 'Usando sua preferência de jogo',
    'Waiting for a folder…': 'Esperando por uma pasta…',
    'Web Play party: the leader can choose modes enabled for browser players.':
      'Grupo Web Play: o líder pode escolher modos habilitados para jogadores de navegador.',
    'Windows only': 'Somente Windows',
    "You're all set": 'Você está pronto',
    'Your first-run preference. You can adjust each feature below.':
      'Sua preferência de primeira execução. Você pode ajustar cada recurso abaixo.',
    'Your personal Counter-Strike settings stay yours.':
      'Suas configurações pessoais do Counter-Strike permanecem suas.',
    'Your setup is saved. Entering the launcher now.':
      'Sua configuração foi salva. Entrando no launcher agora.',
    '3–32 characters: letters, numbers, and underscores.':
      '3–32 caracteres: letras, números e sublinhados.',
    'Add a password to enable username/password login for this account.':
      'Adicione uma senha para ativar o login com nome de usuário/senha para esta conta.',
    'Asset maintenance is unavailable while matchmaking or a match is active.':
      'A manutenção de ativos não está disponível enquanto o matchmaking ou uma partida estão ativos.',
    'Assets are up to date': 'Os ativos estão atualizados',
    'Assets have not been checked this session.': 'Os ativos não foram verificados nesta sessão.',
    Back: 'Voltar',
    'Checking skin assets…': 'Verificando os ativos da pele…',
    'Choose a music set for the launcher. Each set can provide its own background music and match-found cue.':
      'Escolha um conjunto de músicas para o iniciador. Cada conjunto pode fornecer sua própria música de fundo e sugestões de correspondência.',
    Close: 'Fechar',
    'Could not sync skin assets.': 'Não foi possível sincronizar os recursos do skin.',
    'Download assets': 'Baixar ativos',
    'Download missing 1.6 Competitive models before matchmaking. Repair removes managed copies and downloads them again if local assets are damaged.':
      'Baixe os modelos 1.6 Competitivos ausentes antes da combinação. O reparo remove as cópias gerenciadas e as baixa novamente se os ativos locais forem danificados.',
    'Game assets': 'Ativos do jogo',
    'Installation found': 'Instalação encontrada',
    Launcher: 'Lançador',
    'No installation': 'Sem instalação',
    None: 'Nenhum',
    'Preparing asset download': 'Preparando download de ativos',
    'Repair assets': 'Reparar ativos',
    'Repairing skin assets…': 'Reparando ativos da pele…',
    Retry: 'Tentar novamente',
    'Skin asset download progress': 'Progresso do download de recursos de skin',
    'Verify your password before replacing it.': 'Verifique sua senha antes de substituí-la.',
    'Visible to other players. You can change it once every 7 days.':
      'Visível para outros jogadores. Você pode alterá-lo uma vez a cada 7 dias.',
    'COUNTER-STRIKE 1.6 WEB PLAY': 'COUNTER-STRIKE 1.6 JOGO NA WEB',
    'Web Play modes vary. Ranked 5v5 and exclusive launcher features require the desktop client.':
      'Os modos Web Play variam. A classificação 5v5 e os recursos exclusivos do iniciador exigem o cliente de desktop.'
  },
  ja: {
    '1.6 Competitive by Papamo reserves this mode for desktop players. Everyone in your party must use the desktop client before the leader can queue.':
      '1.6 Competitive by Papamo は、このモードをデスクトップ プレーヤー用に予約しています。リーダーがキューに入る前に、パーティーの全員がデスクトップ クライアントを使用する必要があります。',
    '1.6 Competitive settings': '1.6 Competitive の設定',
    'Animated kill cards': 'アニメーションキルカード',
    'Apply code': 'コードを適用する',
    'Applying referral code…': '紹介コードを適用中…',
    'Assets & previews': 'アセットとプレビュー',
    'Back to website': 'ウェブサイトに戻る',
    'Browser matches launch the Steam copy of Counter-Strike directly. You do not need to choose a local game folder or install launcher-managed files.':
      'ブラウザ マッチでは、Counter-Strike の Steam コピーが直接起動されます。ローカルのゲーム フォルダーを選択したり、ランチャーで管理されるファイルをインストールしたりする必要はありません。',
    'By accepting, you commit to this match. Leaving after acceptance may result in a penalty. Please ensure you are ready to play before continuing.':
      '承諾すると、この試合に参加することになります。承諾後に退会するとペナルティが課される場合があります。続行する前に、プレイする準備ができていることを確認してください。',
    'CS2 / CSGO crosshair code': 'CS2 / CSGO 十字線コード',
    'CS2 pixel sizes scale with the game resolution. Dynamic spread uses GoldSrc movement and shots. Follow recoil is saved in the share code but is not yet drawn in game.':
      'CS2 のピクセル サイズはゲームの解像度に応じて変化します。ダイナミックスプレッドはGoldSrcの動きとショットを使用します。フォローリコイルはシェアコードに保存されますが、ゲーム内ではまだ描画されていません。',
    'Center dot': 'センタードット',
    Changelog: '変更履歴',
    'Changes save automatically. Turn on In-game enhancements in General to use the crosshair during matches.':
      '変更は自動的に保存されます。試合中に十字線を使用するには、一般的なゲーム内機能強化をオンにします。',
    'Checking installation…': 'インストールを確認中…',
    'Checking referral status…': '紹介ステータスを確認しています…',
    'Choose a different installation': '別のインストールを選択してください',
    'Choose installation folder': 'インストールフォルダーを選択してください',
    'Choose the game folder or its cstrike subfolder. The launcher will find the executable and save your selection automatically.':
      'ゲームフォルダーまたはその cstrike サブフォルダーを選択します。ランチャーは実行可能ファイルを見つけて、選択内容を自動的に保存します。',
    'Code unavailable': 'コードが利用できません',
    Color: '色',
    'Community links': 'コミュニティリンク',
    'Configure browser audio, voice, language, and account credentials.':
      'ブラウザのオーディオ、音声、言語、アカウントの資格情報を構成します。',
    'Connect Google, Facebook, or Discord so any provider can authenticate this same player account.':
      'Google、Facebook、または Discord に接続すると、どのプロバイダーでもこの同じプレーヤー アカウントを認証できます。',
    Copied: 'コピーされました',
    Copy: 'コピー',
    'Copy code': 'コードをコピーする',
    'Could not save crosshair.': '十字線を保存できませんでした。',
    'Counter-Strike 1.6 on Steam': 'Steam 上のカウンターストライク 1.6',
    'Counter-Strike path saved.': 'Counter-Strike パスが保存されました。',
    Crosshair: '十字線',
    'Crosshair preview': '十字線プレビュー',
    'Custom Setup': 'カスタムセットアップ',
    'Custom crosshairs are available in the desktop launcher. Download it to edit your crosshair and use it in Counter-Strike.':
      'カスタム十字線はデスクトップ ランチャーで使用できます。ダウンロードしてクロスヘアを編集し、Counter-Strike で使用してください。',
    "Custom in-game crosshairs are temporarily disabled while we revise compatibility with different Counter-Strike clients. Your game's normal crosshair remains active.":
      'さまざまな Counter-Strike クライアントとの互換性を修正する間、カスタムのゲーム内十字線は一時的に無効になります。ゲームの通常の十字線はアクティブなままです。',
    'Desktop client required': 'デスクトップクライアントが必要です',
    'Desktop only': 'デスクトップのみ',
    'Detect installation now': '今すぐインストールを検出する',
    'Detecting Counter-Strike…': 'カウンターストライクを検出中…',
    'Download desktop launcher': 'デスクトップランチャーをダウンロード',
    'Downloading installer': 'インストーラーをダウンロードしています',
    'Dynamic gap': 'ダイナミックギャップ',
    'Enable In-game enhancements in General to use kill cards.':
      'キルカードを使用するには、一般的なゲーム内機能強化を有効にします。',
    'Enable animated kill cards': 'アニメーション化されたキルカードを有効にする',
    'Enable fast weapon switch': '素早い武器切り替えを有効にする',
    'Enable in-game enhancements': 'ゲーム内の機能強化を有効にする',
    'Enter 1.6 Competitive': '1.6 競争力を入力してください',
    'Fast weapon switch': '素早い武器切り替え',
    'Finish the Windows installer. We’ll detect the folder you choose.':
      'Windows インストーラーを終了します。選択したフォルダーが検出されます。',
    'Follow & support': 'フォロー＆サポート',
    Full: 'フル',
    'Get desktop app': 'デスクトップアプリを入手',
    'Get the desktop client': 'デスクトップクライアントを入手する',
    'HUD and crosshair': 'HUD と十字線',
    Half: '半分',
    'Import code': 'コードをインポートする',
    'In-game appearance': 'ゲーム内での登場',
    'In-game enhancements': 'ゲーム内の機能強化',
    'Install NextClient': 'NextClientをインストールする',
    'Install NextClient from its official download, or select an existing installation above.':
      'NextClient を公式ダウンロードからインストールするか、上記の既存のインストールを選択します。',
    'Installation folder': 'インストールフォルダ',
    'Installation selected': 'インストールが選択されました',
    'Installer opened': 'インストーラーが開きました',
    'Invalid crosshair code.': '無効な十字線コードです。',
    'Invite a friend': '友達を招待する',
    'Invite friends later using your own code in Settings.':
      '後で設定で独自のコードを使用して友達を招待します。',
    'Loading referral code': '紹介コードを読み込んでいます',
    'NextClient installation could not be selected.':
      'NextClient のインストールを選択できませんでした。',
    'NextClient requires Windows.': 'NextClient には Windows が必要です。',
    'NextClient was not detected. Choose its installation folder.':
      'NextClient が検出されませんでした。インストールフォルダーを選択します。',
    'No Counter-Strike folder selected': 'Counter-Strike フォルダーが選択されていません',
    'No installation selected': 'インストールが選択されていません',
    'No maps are available for this mode': 'このモードでは利用できるマップはありません',
    'Open Counter-Strike on Steam': 'Steam で Counter Strike を開く',
    'Open Steam store': 'Steamストアを開く',
    Outline: '概要',
    'Outline color': '輪郭の色',
    'Own the game on Steam, then select its Half-Life folder.':
      'Steam でゲームを所有し、Half-Life フォルダーを選択します。',
    'Paste a CS2 or CSGO code or tune the controls. Changes save automatically for 1.6 Competitive matches.':
      'CS2 または CSGO コードを貼り付けるか、コントロールを調整します。変更は 1.6 の競合試合で自動的に保存されます。',
    'Paste a CS2 or CSGO crosshair code to import and save it immediately. Older CSGO codes are converted to the current format.':
      'CS2 または CSGO 十字線コードを貼り付けて、すぐにインポートして保存します。古い CSGO コードは現在の形式に変換されます。',
    'Preparing your lobby…': 'ロビーを準備しています…',
    Recommended: 'おすすめ',
    'Recommended Setup': '推奨されるセットアップ',
    'Referral code already used on this account.':
      '紹介コードはこのアカウントですでに使用されています。',
    'Reopen browser': 'ブラウザを再度開く',
    'Required match files are checked before each game launches. You can change the installation and features in Settings later.':
      '必要な一致ファイルは、各ゲームの起動前にチェックされます。インストールと機能は後で [設定] で変更できます。',
    'Restore recommended': '復元を推奨',
    'Retry detection': 'リトライ検出',
    'Retry installer': 'インストーラーを再試行します',
    'Retry save': '保存を再試行',
    'Save your Counter-Strike folder above before downloading assets.':
      'アセットをダウンロードする前に、上記の Counter-Strike フォルダーを保存してください。',
    'Saving your setup…': '設定を保存しています…',
    'Select the code above to copy it manually.': '上のコードを選択して手動でコピーします。',
    'Select weapons immediately with number keys. Custom Setup leaves your game preference alone until you change this switch.':
      '数字キーですぐに武器を選択します。カスタム セットアップでは、このスイッチを変更するまでゲームの設定はそのままになります。',
    'Set up your Counter-Strike 1.6 folder before reconnecting to the match.':
      '試合に再接続する前に、Counter-Strike 1.6 フォルダーをセットアップしてください。',
    'Setup preference': 'セットアップの設定',
    'Share your referral code. When a friend uses it, you both receive rewards.':
      '紹介コードを共有してください。友達がそれを使用すると、両方とも報酬を受け取ります。',
    'Show an animated card for each kill above the round timer. The last card is ACE in 3v3 or 5v5. FFA stacks up to 16 cards without ACE.':
      'ラウンドタイマーの上にキルごとにアニメーションカードを表示します。最後のカードは 3v3 または 5v5 の ACE です。 FFA は ACE なしで最大 16 枚のカードをスタックします。',
    'Show the 1.6 Competitive scoreboard, crosshair, teammate tags, and kill cards in supported Counter-Strike 1.6 clients on Steam and standalone installations on Windows or Linux. NextClient uses its own compatible host and crosshair settings. Game files are restored after exit. This setting does not control match screenshot review.':
      'Steam版およびWindows・Linuxの単独インストールで対応するCounter-Strike 1.6クライアントに、1.6 Competitiveのスコアボード、クロスヘア、味方タグ、キルカードを表示します。NextClientは独自の互換設定を使用します。ゲーム終了後にファイルは復元されます。この設定は試合のスクリーンショット審査には影響しません。',
    'Skip for now': '今のところスキップしてください',
    'Streamed from your region': 'お住まいの地域からストリーミング',
    Style: 'スタイル',
    'The web app streams managed skin and model assets from the selected regional server. There is no launcher asset folder to download or repair.':
      'Web アプリは、選択された地域サーバーから管理されたスキンとモデルのアセットをストリーミングします。ダウンロードまたは修復するランチャー アセット フォルダーはありません。',
    'This game mode is not available for Web Play. Choose another mode or use a desktop-only party.':
      'このゲーム モードは Web プレイでは利用できません。別のモードを選択するか、デスクトップのみのパーティーを使用してください。',
    'This mode is unavailable for Web Play or mixed parties':
      'このモードは、Web プレイまたは混合パーティーでは使用できません。',
    'This mode is unavailable for Web Play or mixed parties.':
      'このモードは、Web プレイまたは混合パーティーでは使用できません。',
    'Use CS2 controls': 'CS2コントロールを使用する',
    'Using your game preference': 'ゲームの設定を使用する',
    'Waiting for a folder…': 'フォルダーを待っています…',
    'Web Play party: the leader can choose modes enabled for browser players.':
      'Web プレイ パーティー: リーダーはブラウザ プレーヤーに対して有効なモードを選択できます。',
    'Windows only': 'Windowsのみ',
    "You're all set": '準備は完了です',
    'Your first-run preference. You can adjust each feature below.':
      '初回実行時の設定。以下の各機能を調整できます。',
    'Your personal Counter-Strike settings stay yours.':
      'Counter-Strike の個人設定はそのまま残ります。',
    'Your setup is saved. Entering the launcher now.': '設定が保存されます。ランチャーに入ります。',
    '3–32 characters: letters, numbers, and underscores.':
      '3 ～ 32 文字: 文字、数字、アンダースコア。',
    'Account credentials': 'アカウントの認証情報',
    'Add a password to enable username/password login for this account.':
      'パスワードを追加して、このアカウントのユーザー名/パスワードによるログインを有効にします。',
    'Asset maintenance is unavailable while matchmaking or a match is active.':
      'マッチメイキングまたはマッチがアクティブな間は、アセットのメンテナンスは利用できません。',
    Assets: '資産',
    'Assets & downloads': 'アセットとダウンロード',
    'Assets are up to date': 'アセットは最新です',
    'Assets have not been checked this session.':
      'このセッションではアセットはチェックされていません。',
    Audio: 'オーディオ',
    Browse: '閲覧する',
    'Change password': 'パスワードを変更する',
    'Change username': 'ユーザー名の変更',
    'Check, download, or repair the managed game assets used by 1.6 Competitive.':
      '1.6 Competitive で使用される管理対象ゲーム アセットを確認、ダウンロード、または修復します。',
    'Checking availability…': '空き状況を確認中…',
    'Checking connection…': '接続を確認中…',
    'Checking skin assets…': 'スキン アセットを確認しています…',
    'Choose a music set for the launcher. Each set can provide its own background music and match-found cue.':
      'ランチャーの音楽セットを選択します。各セットは、独自の BGM と試合結果の合図を提供できます。',
    'Configure the game client, manage downloaded assets, and update your account credentials.':
      'ゲーム クライアントを構成し、ダウンロードしたアセットを管理し、アカウントの資格情報を更新します。',
    'Configure voice bindings, launcher music, and interface sound effects.':
      '音声バインディング、ランチャー音楽、インターフェイスのサウンド効果を構成します。',
    'Confirm new password': '新しいパスワードを確認します',
    Connected: '接続済み',
    'Connected accounts': '接続されたアカウント',
    'Control launcher music and interface sounds. These preferences are saved on this device.':
      'ランチャーの音楽とインターフェースのサウンドを制御します。これらの設定はこのデバイスに保存されます。',
    'Could not sync skin assets.': 'スキン アセットを同期できませんでした。',
    'Counter-Strike is not installed yet?': 'Counter-Strike はまだインストールされていませんか?',
    'Create password': 'パスワードの作成',
    Credentials: '資格情報',
    'Current username': '現在のユーザー名',
    'Download assets': 'アセットをダウンロードする',
    'Download missing 1.6 Competitive models before matchmaking. Repair removes managed copies and downloads them again if local assets are damaged.':
      'マッチメイキングの前に、不足している 1.6 競合モデルをダウンロードしてください。ローカル資産が破損している場合、修復により管理コピーが削除され、再度ダウンロードされます。',
    'Download on Steam': 'Steamでダウンロード',
    'Game assets': 'ゲームアセット',
    'Game client': 'ゲームクライアント',
    General: '一般',
    'Installation found': 'インストールが見つかりました',
    Launcher: 'ランチャー',
    'Launcher settings': 'ランチャーの設定',
    'Manage your username, sign-in methods, and password.':
      'ユーザー名、サインイン方法、パスワードを管理します。',
    'Music set': 'ミュージックセット',
    'New password': '新しいパスワード',
    'New username': '新しいユーザー名',
    'No installation': 'インストールなし',
    None: 'なし',
    'Opening…': 'オープニング…',
    'Password changed.': 'パスワードが変更されました。',
    'Password created.': 'パスワードが作成されました。',
    'Preparing asset download': 'アセットのダウンロードを準備しています',
    'Repair assets': '資産を修復する',
    'Repairing skin assets…': 'スキン アセットを修復しています…',
    'Saved locally in:': 'ローカルに保存される場所:',
    'Saving…': '保存中…',
    'Sign out': 'サインアウト',
    'Signing out…': 'サインアウト中…',
    'Skin asset download progress': 'スキン アセットのダウンロードの進行状況',
    'Something went wrong. Please try again.': '何か問題が発生しました。もう一度試してください。',
    'Username is already taken': 'ユーザー名はすでに使用されています',
    'Username is available': 'ユーザー名は利用可能です',
    'Verify password': 'パスワードを確認してください',
    'Verify your password before replacing it.':
      'パスワードを置き換える前に、パスワードを確認してください。',
    'Visible to other players. You can change it once every 7 days.':
      '他のプレイヤーにも表示されます。 7日に1回変更できます。',
    'Voice & Audio': '音声とオーディオ',
    'Voice and launcher audio': '音声とランチャーオーディオ',
    'COUNTER-STRIKE 1.6 WEB PLAY': 'カウンターストライク 1.6 ウェブプレイ',
    'Web Play modes vary. Ranked 5v5 and exclusive launcher features require the desktop client.':
      'Web Play モードはさまざまです。ランク 5v5 および専用ランチャー機能にはデスクトップ クライアントが必要です。'
  }
}

export const translateRuntimeSettings = (
  language: SupportedLanguageCode,
  source: string
): string => {
  if (language === 'en' || !source) return source
  const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!match) return source
  const [, leading, body, trailing] = match
  const translated = catalogs[language]?.[body]
  return translated === undefined ? source : `${leading}${translated}${trailing}`
}
