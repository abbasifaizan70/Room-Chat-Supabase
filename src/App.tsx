import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DmChatApp } from './DmChatApp'
import { getAuthRedirectUrl, getSupabase, isSupabaseConfigured } from './lib/supabase'
import './App.css'

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="app auth-screen">
        <div className="auth-backdrop" aria-hidden="true" />
        <div className="auth-panel">
          <header className="auth-header">
            <div className="auth-brand" aria-hidden="true">
              <span className="auth-brand-mark">⚠</span>
            </div>
            <h1 className="auth-title">Configuration required</h1>
            <p className="lede">
              Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> at build
              time.
            </p>
          </header>
          <div className="auth-card config-hint">
            <p>
              <strong>Local:</strong> copy <code>.env.example</code> to <code>.env</code>, add your
              keys from Supabase → Project Settings → API, then run <code>npm run dev</code> again.
            </p>
            <p>
              <strong>GitHub Pages:</strong> in the repo go to Settings → Secrets and variables →
              Actions, and add repository secrets named exactly{' '}
              <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>. Push a new
              commit or re-run the deploy workflow so the site rebuilds with those values.
            </p>
          </div>
        </div>
      </div>
    )
  }
  return <ChatApp />
}

function ChatApp() {
  const supabase = getSupabase()
  const [session, setSession] = useState<Session | null>(null)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) setSession(s)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase])

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)
    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { username: username.trim() || undefined },
          },
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setAuthError(null)
    setGoogleLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getAuthRedirectUrl() },
      })
      if (error) throw error
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed')
      setGoogleLoading(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (!session) {
    return (
      <div className="app auth-screen">
        <div className="auth-backdrop" aria-hidden="true" />
        <div className="auth-panel">
          <header className="auth-header">
            <div className="auth-brand" aria-hidden="true">
              <span className="auth-brand-mark">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M20 2H4a2 2 0 0 0-2 2v16l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 9h6M7 13h4"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </div>
            <h1 className="auth-title">Supabase chat</h1>
            <p className="lede">Sign in to message people and groups securely.</p>
          </header>

          <div className="auth-card">
            <button
              type="button"
              className="auth-google"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || authLoading}
            >
              <span className="auth-google-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path
                    fill="#4285F4"
                    d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                  />
                  <path
                    fill="#34A853"
                    d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.348 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"
                  />
                  <path
                    fill="#EA4335"
                    d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
                  />
                </svg>
              </span>
              {googleLoading ? 'Redirecting to Google…' : 'Continue with Google'}
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <form className="auth-form" onSubmit={handleAuth}>
              <div className="tabs" role="tablist" aria-label="Account">
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'signin'}
                  className={authMode === 'signin' ? 'active' : ''}
                  onClick={() => setAuthMode('signin')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'signup'}
                  className={authMode === 'signup' ? 'active' : ''}
                  onClick={() => setAuthMode('signup')}
                >
                  Create account
                </button>
              </div>
              {authMode === 'signup' && (
                <label className="field">
                  <span>Display name</span>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="nickname"
                    placeholder="How others find you"
                  />
                </label>
              )}
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                />
              </label>
              {authError && <p className="error">{authError}</p>}
              <button type="submit" className="primary" disabled={authLoading || googleLoading}>
                {authLoading ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </form>
          </div>

          <p className="auth-footnote">
            By continuing you agree to use this app only as intended for your Supabase project.
          </p>
        </div>
      </div>
    )
  }

  return <DmChatApp supabase={supabase} session={session} onSignOut={handleSignOut} />
}
