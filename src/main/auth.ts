import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { claudeEnv, claudeExecutable, scanWorkDir } from './paths.ts'
import type { AuthStatus, LoginEvent } from '../shared/types.ts'

function runCli(args: string[], timeoutMs = 20_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(claudeExecutable(), args, { env: claudeEnv(), cwd: scanWorkDir(), windowsHide: true })
    let stdout = ''
    let stderr = ''
    p.stdout.on('data', (d) => (stdout += d))
    p.stderr.on('data', (d) => (stderr += d))
    const t = setTimeout(() => {
      p.kill()
      reject(new Error(`claude ${args.join(' ')} timed out`))
    }, timeoutMs)
    p.on('error', (e) => {
      clearTimeout(t)
      reject(e)
    })
    p.on('close', (code) => {
      clearTimeout(t)
      resolve({ code, stdout, stderr })
    })
  })
}

export async function getAuthStatus(): Promise<AuthStatus> {
  try {
    // Exits 1 when signed out but still prints the JSON, so parse regardless of code.
    const { stdout, stderr } = await runCli(['auth', 'status', '--json'])
    const json = JSON.parse(stdout.slice(stdout.indexOf('{')))
    const isSubscription = json.authMethod === 'claude.ai'
    return {
      loggedIn: Boolean(json.loggedIn) && isSubscription,
      email: json.email ?? null,
      subscriptionType: json.subscriptionType ?? null,
      authMethod: json.authMethod ?? null,
      error:
        json.loggedIn && !isSubscription
          ? 'Signed in without a Claude subscription. Sign in with your Claude account instead.'
          : stderr.trim() || null,
    }
  } catch (e) {
    return { loggedIn: false, email: null, subscriptionType: null, authMethod: null, error: (e as Error).message }
  }
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b\[[0-9;?]*[A-Za-z]/g

let loginProc: ChildProcessWithoutNullStreams | null = null

/**
 * Drives `claude auth login`. The CLI opens the system browser on Anthropic's own
 * sign-in page (so SSO / SAML and passkeys work exactly as on claude.ai) and listens
 * on localhost for the redirect. If the redirect can't reach us, the page shows a
 * code the user pastes back, which we forward to the CLI's stdin.
 */
export function startLogin(opts: { sso: boolean; email?: string }, emit: (e: LoginEvent) => void) {
  cancelLogin()
  const args = ['auth', 'login', '--claudeai']
  if (opts.sso) args.push('--sso')
  if (opts.email) args.push('--email', opts.email)

  const p = spawn(claudeExecutable(), args, { env: claudeEnv(), cwd: scanWorkDir(), windowsHide: true })
  loginProc = p
  let buf = ''
  let sentUrl = false
  let askedCode = false

  const onData = (d: Buffer) => {
    buf += d.toString().replace(ANSI, '')
    const url = buf.match(/https:\/\/\S+/)?.[0]
    if (url && !sentUrl) {
      sentUrl = true
      emit({ type: 'url', url })
    }
    if (!askedCode && /paste code/i.test(buf)) {
      askedCode = true
      emit({ type: 'waiting-for-code' })
    }
  }
  p.stdout.on('data', onData)
  p.stderr.on('data', onData)
  p.on('error', (e) => emit({ type: 'error', message: e.message }))
  p.on('close', async (code) => {
    if (loginProc !== p) return // cancelled or superseded
    loginProc = null
    const status = await getAuthStatus()
    if (code === 0 && status.loggedIn) emit({ type: 'done', status })
    else {
      const tail = buf.trim().split('\n').filter(Boolean).at(-1)
      emit({ type: 'error', message: status.error ?? tail ?? `Sign-in ended (code ${code}).` })
    }
  })
}

export function submitLoginCode(code: string) {
  if (!loginProc) throw new Error('No sign-in in progress.')
  loginProc.stdin.write(code.trim() + '\n')
}

export function cancelLogin() {
  const p = loginProc
  loginProc = null
  p?.kill()
}

export async function logout() {
  await runCli(['auth', 'logout'])
}
