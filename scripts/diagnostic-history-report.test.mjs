import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
const root = await mkdtemp(join(tmpdir(), '16c-history-report-'))
after(() => rm(root, { recursive: true, force: true }))
const file = join(root, 'report.mjs')
await build({
  entryPoints: ['src/main/diagnostic-logs.ts'],
  outfile: file,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  plugins: [
    {
      name: 'host',
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /^(electron|\.\/auth|\.\/config|\.\/game\/|\.\/matchmaking-diagnostics|\.\/diagnostic-report-request|\.\.\/shared\/server-clock)/
          },
          (args) => ({ path: args.path, namespace: 'host' })
        )
        builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({
          contents: `
   export const app={getVersion:()=> '2026.1107.7',getPath:()=>'/fixture'};
   export const getSessionToken=()=> 'private-token';
   export const getSessionUsername=()=> 'current-account';
   export const getSavedCs16Executable=async()=>null;
   export const gamePerformanceReport=()=>'';
   export const refreshGamePerformance=async()=>{};
   export const API_BASE_URL='https://example.test';
   export const serverClockNow=()=>Date.now();
   export const collectGameConsoleLogs=async()=>'';
   export const redactReportLogs=s=>s;
   export const readMatchLaunchDiagnostics=async()=>{throw Error('no match context should be read')};
   export const postDiagnosticReport=async()=>{};
   export const musicDeliveryReport=async()=>'';
   export const matchmakingDiagnostics={
    setOwner:owner=>globalThis.reportOwner=owner,
    report:()=>JSON.stringify({snapshot:{matchId:null},timeline:[]}),
    historyReport:async()=>JSON.stringify({timeline:[{stage:'helper_failed',data:{code:'GAME_SPAWN_FAILED',osError:740,elevated:false}}]})
   };
  `
        }))
      }
    }
  ]
})
const { collectDiagnosticIssueLogs } = await import(pathToFileURL(file))
after(() => delete globalThis.reportOwner)
test('issue reports without a match include persisted history near the top even if renderer logs fill the report', async () => {
  const report = await collectDiagnosticIssueLogs(['x'.repeat(350000)])
  assert.equal(globalThis.reportOwner, 'current-account')
  assert.ok(report.includes('[Saved launch history]'))
  assert.ok(report.indexOf('GAME_SPAWN_FAILED') < 2000)
  assert.ok(report.includes('"elevated":false'))
  assert.ok(!report.includes('private-token'))
})
