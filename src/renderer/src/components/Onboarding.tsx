import { useEffect, useState } from 'react'
import { Check, ExternalLink, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react'
import type { AuthStatus, GmailStatus, LoginEvent } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/Sidebar'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/useApp'

type Step = 'signin' | 'gmail' | 'ready'
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'signin', label: 'Sign in to Claude' },
  { id: 'gmail', label: 'Connect Gmail' },
  { id: 'ready', label: 'Open the app' },
]

export function Onboarding() {
  const [step, setStep] = useState<Step | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)

  useEffect(() => {
    void window.bills.authStatus().then((s) => {
      setAuth(s)
      setStep(s.loggedIn ? 'gmail' : 'signin')
    })
  }, [])

  const idx = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="grid h-full grid-cols-[minmax(18rem,26rem)_1fr] bg-paper">
      <aside className="flex flex-col border-r border-rule bg-slip px-10 py-10">
        <div className="flex items-center gap-3">
          <Logo className="size-9" />
          <span className="text-lg font-semibold tracking-tight">Bills Tracker</span>
        </div>
        <p className="mt-8 max-w-[34ch] text-[15px] leading-relaxed text-ink-muted">
          Finds the bills in your Gmail twice a day and lines them up by due date, with the payment code ready to copy.
        </p>
        <ol className="mt-10 flex flex-col gap-1" aria-label="Setup steps">
          {STEPS.map((s, i) => {
            const done = idx > i
            const current = idx === i
            return (
              <li
                key={s.id}
                aria-current={current ? 'step' : undefined}
                className={cn('flex items-center gap-3 rounded-md px-2 py-2 text-[14px]', current ? 'font-semibold text-ink' : 'text-ink-muted')}
              >
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-full border text-[12px] font-semibold',
                    done && 'border-later bg-later text-white',
                    current && 'border-stamp text-stamp',
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                {s.label}
              </li>
            )
          })}
        </ol>
        <p className="mt-auto flex items-start gap-2 text-[13px] leading-snug text-ink-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          Bills Tracker only reads email. It can’t send, delete or label anything, and your bills stay on this PC.
        </p>
      </aside>

      <section className="flex items-center overflow-auto px-14 py-10">
        <div className="w-full max-w-[34rem]">
          {step === null && <Loader2 className="size-6 animate-spin text-ink-muted" />}
          {step === 'signin' && (
            <SignIn
              onDone={(s) => {
                setAuth(s)
                setStep('gmail')
              }}
            />
          )}
          {step === 'gmail' && <ConnectGmail email={auth?.email ?? null} onDone={() => setStep('ready')} />}
          {step === 'ready' && <Ready />}
        </div>
      </section>
    </div>
  )
}

function SignIn({ onDone }: { onDone: (s: AuthStatus) => void }) {
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'error'>('idle')
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    return window.bills.onLoginEvent((e: LoginEvent) => {
      if (e.type === 'url') setUrl(e.url)
      if (e.type === 'done') onDone(e.status)
      if (e.type === 'error') {
        setPhase('error')
        setError(e.message)
      }
    })
  }, [onDone])

  async function start(sso: boolean) {
    setError(null)
    setUrl(null)
    setCode('')
    setShowCode(false)
    setPhase('waiting')
    await window.bills.startLogin({ sso, email: email.trim() || undefined })
  }

  if (phase === 'waiting') {
    return (
      <div>
        <Loader2 className="size-7 animate-spin text-stamp" />
        <h1 className="mt-5 text-[28px] font-semibold leading-tight tracking-tight">Finish signing in in your browser</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          We opened Anthropic’s sign-in page. Sign in with your Claude account, including your company’s single sign-on if
          you use one, and approve access. This window moves on by itself when you’re done.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {url && (
            <Button variant="outline" onClick={() => void window.bills.openExternal(url)}>
              <ExternalLink /> Open the sign-in page again
            </Button>
          )}
          <Button variant="ghost" onClick={() => setShowCode((v) => !v)}>
            <KeyRound /> The page showed me a code
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void window.bills.cancelLogin()
              setPhase('idle')
            }}
          >
            Cancel
          </Button>
        </div>
        {showCode && (
          <form
            className="mt-6 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim()) void window.bills.submitLoginCode(code)
            }}
          >
            <Label htmlFor="code">Paste the code from the browser</Label>
            <div className="flex gap-2">
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus className="bg-slip" />
              <Button type="submit" disabled={!code.trim()}>
                Continue
              </Button>
            </div>
          </form>
        )}
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Sign in with your Claude account</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
        Bills Tracker uses your Claude subscription to read your bills. Sign-in happens on Anthropic’s own page in your
        browser, so your password never passes through this app.
      </p>
      {phase === 'error' && error && (
        <p role="alert" className="mt-5 rounded-md bg-overdue-wash px-4 py-3 text-[14px] text-overdue">
          Sign-in didn’t finish: {error}
        </p>
      )}
      <div className="mt-8 grid max-w-sm gap-1.5">
        <Label htmlFor="email" className="text-ink-muted">
          Email (optional, fills in the sign-in page)
        </Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-slip" />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="lg" onClick={() => void start(false)}>
          Sign in with Claude
        </Button>
        <Button size="lg" variant="outline" onClick={() => void start(true)}>
          Sign in with single sign-on
        </Button>
      </div>
    </div>
  )
}

function ConnectGmail({ email, onDone }: { email: string | null; onDone: () => void }) {
  const [status, setStatus] = useState<GmailStatus | null>(null)
  const [checking, setChecking] = useState(false)

  async function check() {
    setChecking(true)
    try {
      const s = await window.bills.gmailStatus()
      setStatus(s)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void check()
  }, [])

  const connected = status?.state === 'connected'

  return (
    <div>
      {email && (
        <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-later-wash px-3 py-1 text-[13px] text-later">
          <Check className="size-3.5" /> Signed in as {email}
        </p>
      )}
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
        {connected ? 'Gmail is connected' : 'Connect Gmail to your Claude account'}
      </h1>
      {checking && !status ? (
        <p className="mt-3 flex items-center gap-2 text-[15px] text-ink-muted">
          <Loader2 className="size-4 animate-spin" /> Looking for the Gmail connector
        </p>
      ) : connected ? (
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          Bills Tracker will read your email through the Gmail connector on your Claude account, with read-only tools.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
            Bills Tracker reads email through Claude’s Gmail connector. Turn it on in Claude’s settings and approve Google
            access, then come back here.
          </p>
          {status?.state === 'needs-auth' && (
            <p className="mt-4 text-[14px] text-soon">The connector is added but Google access isn’t approved yet.</p>
          )}
          {status?.state === 'failed' && <p className="mt-4 text-[14px] text-overdue">{status.error}</p>}
        </>
      )}
      <div className="mt-8 flex flex-wrap gap-2">
        {connected ? (
          <Button size="lg" onClick={onDone}>
            Continue
          </Button>
        ) : (
          <>
            <Button size="lg" onClick={() => void window.bills.openExternal('https://claude.ai/settings/connectors')}>
              <Mail /> Open Claude connectors
            </Button>
            <Button size="lg" variant="outline" disabled={checking} onClick={() => void check()}>
              {checking && <Loader2 className="animate-spin" />} Check again
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function Ready() {
  const settings = useApp((s) => s.snapshot?.settings)
  const times = settings?.scanTimes.join(' and ') ?? '08:00 and 20:00'
  return (
    <div>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">You’re all set</h1>
      <ul className="mt-5 flex flex-col gap-3 text-[15px] leading-relaxed">
        <li className="flex gap-3">
          <Check className="mt-1 size-4 shrink-0 text-later" /> Your email gets checked every day at {times}, and right
          away when you open the app.
        </li>
        <li className="flex gap-3">
          <Check className="mt-1 size-4 shrink-0 text-later" /> Bills Tracker starts with Windows and waits in the tray.
        </li>
        <li className="flex gap-3">
          <Check className="mt-1 size-4 shrink-0 text-later" /> Press Ctrl+F anywhere to search every bill, paid or not.
        </li>
      </ul>
      <Button size="lg" className="mt-9" onClick={() => void window.bills.completeOnboarding()}>
        Open Bills Tracker
      </Button>
    </div>
  )
}
