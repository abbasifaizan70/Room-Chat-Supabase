import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DmChatApp } from './DmChatApp'
import { getSupabase, isSupabaseConfigured } from './lib/supabase'
import './App.css'

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="app auth-screen">
        <header className="auth-header">
          <h1 className="auth-title">Supabase configuration missing</h1>
          <p className="lede">
            The app needs <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{' '}
            at build time.
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

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (!session) {
    return (
      <div className="app auth-screen">
        <header className="auth-header">
          <h1 className="auth-title">Supabase chat</h1>
          <p className="lede">Sign in to send private messages.</p>
        </header>
        <form className="auth-card" onSubmit={handleAuth}>
          <div className="tabs">
            <button
              type="button"
              className={authMode === 'signin' ? 'active' : ''}
              onClick={() => setAuthMode('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
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
          <button type="submit" className="primary" disabled={authLoading}>
            {authLoading ? 'Please wait…' : authMode === 'signup' ? 'Sign up' : 'Sign in'}
          </button>
        </form>
      </div>
    )
  }

  return <DmChatApp supabase={supabase} session={session} onSignOut={handleSignOut} />
}
