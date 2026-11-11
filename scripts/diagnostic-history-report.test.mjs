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
   export const getSessionPlayerId=()=> 'current-player';
   export const getSavedCs16Executable=async()=>null;
   export class LegacyGameService {
    constructor(){throw Error('legacy installation should not be read for diagnostic history')}
   }
   export const gamePerformanceReport=()=>'';
   export const refreshGamePerformance=async()=>{};
   export const API_BASE_URL='https://example.test';
   export const serverClockNow=()=>Date.now();
   export const collectGameConsoleLogs=async()=>'';
   export const redactReportLogs=s=>s;
   export const readMatchLaunchDiagnostics=async()=>{throw Error('no match context should be read')};
   export const postDiagnosticReport=async(api,token,body)=>{globalThis.submittedReport=body;return {ok:true,json:async()=>({id:'report',createdAt:'now'})}};
   export const musicDeliveryReport=async()=>'';
   export const nativeLaunchReport=async()=> '[Native helper launch failure] GAME_SPAWN_FAILED osError=740';
   export const matchmakingDiagnostics={
    setOwner:owner=>globalThis.reportOwner=owner,
    report:()=>JSON.stringify({snapshot:{matchId:null},timeline:[]}),
    historyReport:async()=>JSON.stringify({timeline:[{stage:'helper_failed',data:{code:'GAME_SPAWN_FAILED',osError:740,elevated:false}},{stage:'helper_failed',data:{code:'NATIVE_CLIENT_CHECK_FAILED',cleanupCodes:'INSPECTOR_STOP_FAILED',matchId:'failed-match',attemptId:'failed-attempt'}}],padding:'y'.repeat(220000)})
   };
  `
        }))
      }
    }
  ]
})
const { collectDiagnosticIssueLogs, reportDiagnosticIssue } = await import(pathToFileURL(file))
after(() => {
  delete globalThis.reportOwner
  delete globalThis.submittedReport
})
test('issue reports without a match include persisted history near the top even if renderer logs fill the report', async () => {
  const report = await collectDiagnosticIssueLogs(['x'.repeat(350000)])
  assert.equal(globalThis.reportOwner, 'current-account')
  assert.equal(report.length, 500000)
  assert.ok(report.includes('[Saved launch history]'))
  assert.ok(report.indexOf('GAME_SPAWN_FAILED') < 2000)
  assert.ok(report.includes('"elevated":false'))
  assert.ok(report.indexOf('NATIVE_CLIENT_CHECK_FAILED') < 2000)
  assert.ok(report.includes('"attemptId":"failed-attempt"'))
  assert.ok(!report.includes('private-token'))
})

test('submitting an issue automatically sends the saved helper failure diagnostics', async () => {
  await reportDiagnosticIssue('Game preparation failed', [])
  assert.equal(globalThis.submittedReport.description, 'Game preparation failed')
  assert.ok(globalThis.submittedReport.logs.includes('NATIVE_CLIENT_CHECK_FAILED'))
  assert.ok(globalThis.submittedReport.logs.includes('failed-attempt'))
  assert.ok(globalThis.submittedReport.logs.includes('INSPECTOR_STOP_FAILED'))
  assert.ok(
    globalThis.submittedReport.logs.includes(
      '[Native helper launch failure] GAME_SPAWN_FAILED osError=740'
    )
  )
  assert.ok(!globalThis.submittedReport.logs.includes('private-token'))
})
