import { app } from 'electron'
import { spawn } from 'node:child_process'

/** Elevate only our verified installed launcher; never pass session secrets. */
export async function requestAdminRestart(
  helper: string,
  executable: string,
  sha256: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(helper, ['--request-admin-restart'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }
    })
    let output = ''
    const timer = setTimeout(() => {
      child.kill() // This helper has no game/session state.
      reject(new Error('match.launch.adminFailed'))
    }, 180000)
    child.once('error', () => {
      clearTimeout(timer)
      reject(new Error('match.launch.adminFailed'))
    })
    child.stdout.on('data', (bytes: Buffer) => {
      if (output.length + bytes.length > 8192) {
        output = ''
        child.kill()
        return
      }
      output += bytes.toString('utf8')
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      try {
        const frame = JSON.parse(output)
        if (code === 0 && frame.protocol === 1 && frame.event === 'admin-approved') resolve()
        else
          reject(
            new Error(
              frame.protocol === 1 &&
                frame.event === 'error' &&
                frame.code === 'ADMIN_RESTART_CANCELLED'
                ? 'match.launch.adminCancelled'
                : 'match.launch.adminFailed'
            )
          )
      } catch {
        reject(new Error('match.launch.adminFailed'))
      }
    })
    child.stdin.on('error', () => {}) // Exit/error resolves the request.
    child.stdin.end(
      JSON.stringify({
        parentPid: process.pid,
        reopen: { executable, sha256, args: ['--return-from-game', '--admin-game-retry'] }
      })
    )
  })
  app.quit()
}
