import { protonRecoveryCommand, type SteamProtonRuntime } from './steam-proton'

/** Host-side guard: Steam waits for the prefix to be idle before launching the
 * game. Starting a long-lived Wine helper first deadlocks that handoff. This
 * supervisor stays outside Wine until hl.exe exists, or recovery is necessary. */
export const protonRecoveryGuardSource = String.raw`
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const options = JSON.parse(process.argv[1]);
const descriptorPath = path.join(options.root, '16competitive/recovery.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
async function ownsDescriptor() {
  const info = await fs.lstat(descriptorPath).catch(() => null);
  if (!info) return false;
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) throw new Error('Invalid recovery descriptor');
  const state = JSON.parse(await fs.readFile(descriptorPath, 'utf8'));
  return state.sessionId === options.sessionId && state.helperSha256 === options.helperSha256;
}
async function gameRunning() {
  const root = await fs.realpath(options.root);
  for (const pid of await fs.readdir('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      if (await fs.readlink('/proc/' + pid + '/cwd') !== root) continue;
      const args = (await fs.readFile('/proc/' + pid + '/cmdline', 'utf8')).split('\0');
      const name = value => path.basename(value.replaceAll('\\', '/')).toLowerCase();
      if (name(args[0]) === 'hl.exe' ||
          (/^wine(?:64)?(?:-preloader)?$/.test(name(args[0])) && name(args[1] || '') === 'hl.exe')) return true;
    } catch { /* A process may exit between proc reads. */ }
  }
  return false;
}
async function run(mode) {
  if (!await ownsDescriptor()) return;
  const hash = crypto.createHash('sha256').update(await fs.readFile(options.helperPath)).digest('hex');
  if (hash !== options.helperSha256) throw new Error('Cosmetic recovery helper changed');
  const args = [...options.command.args];
  args[args.length - 1] = mode;
  await new Promise((resolve, reject) => {
    const child = spawn(options.command.executable, args, {env: {...process.env, ELECTRON_RUN_AS_NODE: undefined}, shell:false, stdio:'ignore'});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Proton recovery failed: ' + code)));
  });
}
(async () => {
  if (!await ownsDescriptor()) throw new Error('Recovery session changed');
  process.stdout.write('16c-recovery-ready\n');
  const deadline = Date.now() + 7200000;
  while (await ownsDescriptor()) {
    const running = await gameRunning();
    if (running) {
      // Steam has passed its waitforexitandrun barrier. The approved Windows
      // guard now watches the existing fixed ticket/heartbeat in this prefix.
      await run('guard-lease');
      return;
    }
    if (!alive(options.launcherPid) || Date.now() >= deadline) {
      await run('restore');
      return;
    }
    await sleep(250);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
`

export function protonRecoveryGuardCommand(
  runtime: SteamProtonRuntime,
  root: string,
  sessionId: string,
  helperPath: string,
  helperSha256: string,
  wineRoot: string,
  launcherPid = process.pid
): { executable: string; args: string[]; env: NodeJS.ProcessEnv } {
  const command = protonRecoveryCommand(runtime, helperPath, [
    '--cosmetic-recovery',
    wineRoot,
    sessionId,
    '0',
    'guard-lease'
  ])
  return {
    executable: process.execPath,
    args: [
      '-e',
      protonRecoveryGuardSource,
      JSON.stringify({
        root,
        sessionId,
        helperPath,
        helperSha256,
        launcherPid,
        command: { executable: command.executable, args: command.args }
      })
    ],
    env: { ...command.env, ELECTRON_RUN_AS_NODE: '1' }
  }
}
