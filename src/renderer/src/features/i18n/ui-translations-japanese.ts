const catalog: Record<string, string> = {
  Home: 'ホーム', Settings: '設定', Inventory: 'インベントリ', Leaderboard: 'ランキング',
  Play: 'プレイ', Store: 'ストア', News: 'ニュース', Profile: 'プロフィール',
  Friends: 'フレンド', Party: 'パーティー', Match: 'マッチ', 'Match History': '試合履歴',
  'Language': '言語', 'Choose the language used by the launcher interface.': 'ランチャーの表示言語を選択してください。',
  'Changes apply immediately and are saved on this device.': '変更はすぐに反映され、このデバイスに保存されます。',
  'Welcome back': 'おかえりなさい', 'Create an account': 'アカウントを作成',
  'Sign in to continue to matchmaking.': 'マッチメイキングを続けるにはサインインしてください。',
  'Choose how you want to create your account.': 'アカウントの作成方法を選択してください。',
  Login: 'ログイン', Register: '登録', or: 'または', Username: 'ユーザー名', Email: 'メールアドレス',
  Password: 'パスワード', 'At least 8 characters': '8文字以上', 'Signing in…': 'サインイン中…',
  'Sign in': 'サインイン', 'Create account': 'アカウントを作成', 'Continue with Facebook': 'Facebookで続行',
  'Exit to desktop': 'デスクトップに戻る', 'Privacy Policy': 'プライバシーポリシー',
  'Terms & Conditions': '利用規約', Continue: '続行', Cancel: 'キャンセル', Close: '閉じる',
  Save: '保存', Search: '検索', Loading: '読み込み中', 'Loading…': '読み込み中…',
  'Retry': '再試行', 'Back': '戻る', 'Confirm': '確認', 'Ready': '準備完了',
  'Queued': 'キュー待機中', 'Join Queue': 'キューに参加', 'Leave Queue': 'キューから退出',
  'Match Found': 'マッチが見つかりました', 'Connecting…': '接続中…', 'Downloading…': 'ダウンロード中…',
  'Preparing match…': 'マッチを準備中…', 'Waiting for players…': 'プレイヤーを待っています…',
  'No matches found.': 'マッチが見つかりません。', 'No friends yet.': 'フレンドはいません。',
  'No items found.': 'アイテムが見つかりません。', 'No results found.': '結果が見つかりません。',
  'Connection lost': '接続が切断されました', 'Reconnecting…': '再接続中…', Online: 'オンライン', Offline: 'オフライン',
  'Select game': 'ゲームを選択', 'Game installation': 'ゲームのインストール先',
  'Choose installation': 'インストール先を選択', 'Detect installations': 'インストール先を検出',
  'Counter-Strike 1.6': 'カウンターストライク 1.6', 'Are you sure?': 'よろしいですか？',
  'Purchase': '購入', 'Equip': '装備', 'Equipped': '装備中', 'Owned': '所持済み',
  'Balance': '残高', 'Matchmaking': 'マッチメイキング', 'Find a match': 'マッチを探す',
  'Searching for players…': 'プレイヤーを検索中…', 'Server ready': 'サーバー準備完了',
  'Launch game': 'ゲームを起動', 'Reconnect': '再接続', 'Match cancelled': 'マッチはキャンセルされました',
  'Something went wrong.': '問題が発生しました。', 'Update available': 'アップデートがあります',
  'Downloading update…': 'アップデートをダウンロード中…', 'Apply update': 'アップデートを適用'
}

const patterns: Array<[RegExp, string]> = [
  [/^(.+) is now online$/, '$1がオンラインになりました'],
  [/^(.+) is now offline$/, '$1がオフラインになりました'],
  [/^Playing since (.+)$/, '$1からプレイ'],
  [/^Players: (\d+)\/(\d+)$/, 'プレイヤー: $1/$2'],
  [/^Downloading assets — (\d+)%$/, 'アセットをダウンロード中 — $1%'],
  [/^Match found on (.+) for (.+)\.$/, '$2のマッチが見つかりました（$1）。'],
  [/^Game server starts in (\d+) seconds?\.$/, 'ゲームサーバーは$1秒後に開始します。'],
  [/^(.+) volume$/, '$1の音量'],
  [/^Search (.+)$/, '$1を検索'],
  [/^Loading (.+)…$/, '$1を読み込み中…']
]

export const translateRuntimeJapanese = (source: string): string => {
  if (!source) return source
  const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!match) return source
  const [, leading, body, trailing] = match
  if (!body) return source
  const exact = catalog[body]
  if (exact !== undefined) return `${leading}${exact}${trailing}`
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(body)) return `${leading}${body.replace(pattern, replacement)}${trailing}`
  }
  return source
}
