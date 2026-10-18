import { guardUpdateTranslations, type GuardLanguage } from '../../shared/guard-update-translations'
import { updateRecoveryTranslations } from '../../shared/update-recovery-translations'

/** Shared by the Electron splash and its static visual preview. Assets are embedded locally. */
export function papamoGuardSplashHtml(
  assets: { artwork: string; emblem: string; font?: string; boldFont?: string },
  language: GuardLanguage = 'en'
): string {
  const copy = guardUpdateTranslations[language]
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'" />
<title>Papamo Guard</title>
<style>
  @font-face { font-family: Rajdhani; src: url('${assets.font ?? ''}') format('woff2'); font-style: normal; font-weight: 600; font-display: block; }
  @font-face { font-family: Rajdhani; src: url('${assets.boldFont ?? ''}') format('woff2'); font-style: normal; font-weight: 700; font-display: block; }
  * { box-sizing: border-box; border-radius: 0; }
  html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #080a09; }
  body { color: #f1efe7; font-family: Rajdhani, sans-serif; font-weight: 600; user-select: none; }
  .splash { position: relative; width: 100%; height: 100%; overflow: hidden; border: 0; }
  .art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,7,6,.4), transparent 25%, transparent 58%, rgba(5,7,6,.8) 79%, #080a09 100%); }
  .game { position: absolute; inset: 22px 14px auto; text-align: center; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,.24); }
  .game-name { margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -.8px; white-space: nowrap; }
  .game-version { margin: 8px 0 0; color: #f1efe7; font-size: 10px; font-weight: 700; letter-spacing: 4px; }
  .brand { position: absolute; left: 24px; right: 24px; bottom: 88px; display: flex; align-items: center; justify-content: center; gap: 11px; }
  .emblem { width: 76px; height: 76px; object-fit: contain; flex-shrink: 0; }
  .brand-name { margin: 0; display: grid; grid-template-columns: auto auto; font-size: 32px; font-weight: 950; line-height: .8; letter-spacing: -.11em; transform: skew(-5deg); }
  .mo { color: #ff5a23; }
  .guard { grid-column: 1 / 3; margin-top: 12px; font-family: inherit; font-size: 20px; font-weight: 900; letter-spacing: .22em; transform: skew(5deg); }
  .status { position: absolute; left: 24px; right: 24px; bottom: 18px; height: 60px; }
  .status-copy { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; height: 48px; gap: 10px; font-size: 13px; line-height: 16px; color: #f1efe7; }
  .status-label { color: #c6c1b7; font-size: 11px; flex-shrink: 0; text-transform: uppercase; }
  .track { height: 2px; overflow: hidden; background: #3a3428; }
  .progress { height: 100%; width: 38%; background: #ff5a23; animation: sweep 1.7s ease-in-out infinite; }
  .progress.determinate { animation: none; transform: none; }
  .actions { position: absolute; left: 0; right: 0; bottom: 70px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px; background: #080a09; }
  .actions a:last-child { grid-column: 1 / -1; }
  .actions[hidden] { display: none; }
  .splash:has(.actions:not([hidden])) .brand { visibility: hidden; }
  .actions a { display: flex; flex: 1; align-items: center; justify-content: center; min-height: 28px; padding: 4px; color: #f1efe7; background: #30271f; font-size: 13px; text-align: center; text-decoration: none; }
  .actions a:first-child { background: #ff5a23; color: #080a09; font-weight: 700; }
  .actions a:hover { filter: brightness(1.15); }
  .actions a:focus-visible { outline: 2px solid #f1efe7; outline-offset: 2px; }
  @keyframes sweep { from { transform: translateX(-110%); } to { transform: translateX(370%); } }
  @media (prefers-reduced-motion: reduce) { .progress { animation: none; width: 100%; opacity: .65; } }
</style>
</head>
<body>
<main class="splash" aria-label="Papamo Guard">
  <img class="art" src="${assets.artwork}" alt="" />
  <div class="shade" aria-hidden="true"></div>
  <header class="game">
    <h1 class="game-name">COUNTER-STRIKE</h1>
    <p class="game-version">1.6 COMPETITIVE</p>
  </header>
  <section class="brand" aria-label="Papamo Guard">
    <img class="emblem" src="${assets.emblem}" alt="" />
    <h2 class="brand-name"><span>PAPA</span><span class="mo">MO</span><small class="guard">GUARD</small></h2>
  </section>
  <div class="status" role="status">
    <div class="status-copy"><span id="status-message">${copy.starting}</span><span id="status-detail" class="status-label">${copy.anticheat}</span></div>
    <div id="status-track" class="track" aria-hidden="true"><div id="status-progress" class="progress"></div></div>
    <nav id="status-actions" class="actions" hidden>
      <a href="papamo-guard://retry">${copy.retry}</a>
      <a href="papamo-guard://exit">${copy.exit}</a>
      <a href="papamo-guard://help">${updateRecoveryTranslations[language].help}</a>
    </nav>
  </div>
</main>
</body>
</html>`
}
