// Verified Steam CS 1.6 stock viewmodels. Keep client, backend and helper pins aligned.
export const STOCK_STICKER_MODELS: Record<string, { model: string; sha256: string }> = {
  glock18: {
    model: 'glock18',
    sha256: 'da789a2e3e892b3ad8fab86e272e5866e4b50e31b353a5ceb10be03daccae90c'
  },
  usp: {
    model: 'usp',
    sha256: '401b52af40a1026f5e5241911af4429da6f84291f755ba2e6013cc4246fd2bf0'
  },
  p228: {
    model: 'p228',
    sha256: '57f29c3069dee35be509c18e901f94449944a64b72830cf02215012738fba87b'
  },
  deagle: {
    model: 'deagle',
    sha256: '5817158952d306c0fbee4d3ef12026078922d1cd4120363e102369a6fdeecec1'
  },
  elite: {
    model: 'elite',
    sha256: 'b3ea70b76c6a227e2b2f064d03130d3c999c7aeb367508bd87b35737d61b8e09'
  },
  fiveseven: {
    model: 'fiveseven',
    sha256: '66611a04dd0c779d703aa3e5a752358959550d72f394bbcef656150a24e63276'
  },
  m3: {
    model: 'm3',
    sha256: '85855d19382afd3820f74a39ec46c9b7d5e90f2969b965a0c4d6636c5a880824'
  },
  xm1014: {
    model: 'xm1014',
    sha256: '512fff0de8530bb26847660e429715b2946d55ae719183626252a4950c9cb609'
  },
  tmp: {
    model: 'tmp',
    sha256: 'e654bd1c4dc504a9be348fea6a318f5cb67ad40cab2ffd41395e17300e0aee6a'
  },
  mac10: {
    model: 'mac10',
    sha256: 'a65101e776983eccd64788118fa121e93649e0908a5db1aeaa5ccad3402517b1'
  },
  mp5navy: {
    model: 'mp5',
    sha256: '33ebb8669a4dfbcba6de9903ed2998c652f7b3f96003380a8900dfd52fdf5316'
  },
  ump45: {
    model: 'ump45',
    sha256: 'e20bd60f6068228c4aab1c2769ca81ae989b41d7228e3b5299e96560df5fec4c'
  },
  p90: {
    model: 'p90',
    sha256: '6920ecbd5c6d67bd6afdb0ba5ee73fead1429ef9db0adfa8c1b5a24b013e7661'
  },
  galil: {
    model: 'galil',
    sha256: '90738d783f37f297c868edcb3a3992f6eab4344af224d1ef0ae4b9300f5183c0'
  },
  famas: {
    model: 'famas',
    sha256: 'a7000c905a6e90e9e31042773b730f5690a809b933f9af1d77f1ef6df15e4c5a'
  },
  ak47: {
    model: 'ak47',
    sha256: '6eb08a5e76210712ad787949e244fd57346b1836a7462f3a436976126e270fa3'
  },
  m4a1: {
    model: 'm4a1',
    sha256: '9248c63dd811d85a062c0d4cdae7213f19a500b4bc73d225c78fa1e61e664033'
  },
  aug: {
    model: 'aug',
    sha256: '8578a1e5c006377f101efd97d55d7dcbff86a3042e87be39b3d37468bd766e23'
  },
  sg552: {
    model: 'sg552',
    sha256: '79f9d875bb1db81acb5841e8c69674994ca83aab99bcd66aad13b021e346fa74'
  },
  scout: {
    model: 'scout',
    sha256: '88d45c5a7ffa5e88443ffb23da350d52db4375049fb8f2946b8bfa48b0cc178b'
  },
  awp: {
    model: 'awp',
    sha256: '8f27919e666c94af49e802dcdc8b796f0cdf89dcb8e0900371ceffcf44cd9349'
  },
  sg550: {
    model: 'sg550',
    sha256: '4171144ce78caaf006d412059baf1c1e8217f64a4102e007d98812b651e18ed8'
  },
  g3sg1: {
    model: 'g3sg1',
    sha256: 'd2adeb4082b1bcdd5d3224ec802e84d1ea9a88a517abc35d62747155c56f87f7'
  },
  m249: {
    model: 'm249',
    sha256: '4590dd20b4ca48357af1c179fcf690f3f4d761245d3efcd12492a0c04974c555'
  },
  hegrenade: {
    model: 'hegrenade',
    sha256: '86f6a5ea2f4fa80b4ce86abb62007b69ea3c500ca0531498630bad1230b0ff41'
  },
  flashbang: {
    model: 'flashbang',
    sha256: '194259d9cf680506608628bc55f8d55a8dd29c4a644bbee185c05cb404444ddb'
  },
  smokegrenade: {
    model: 'smokegrenade',
    sha256: '1b863bc5dfe9fcbde92c6f22ac80e09d655b58b5348872d7ac78826debd8452a'
  },
  knife: {
    model: 'knife',
    sha256: 'f9b753b4a60ad903927fad94644bbd5cd2b849526c7c6a000dd18373e1c08f43'
  }
}

export function stockStickerModel(key: string): { model: string; sha256: string } | undefined {
  return Object.prototype.hasOwnProperty.call(STOCK_STICKER_MODELS, key)
    ? STOCK_STICKER_MODELS[key]
    : undefined
}

/** Canonical source shared by the editor, match server and native module. */
export function stockStickerModelPath(key: string): string {
  const model = stockStickerModel(key)
  if (!model) throw new Error('STICKER_WEAPON_INVALID')
  return `models/16competitive/stock/${model.sha256.slice(0, 16)}/v.mdl`
}
