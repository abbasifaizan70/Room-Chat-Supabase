import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from './lib/supabase'
import './App.css'

type MessageRow = {
  id: string
  created_at: string
  user_id: string
  content: string
  room_id: string
  profiles: { username: string } | null
}

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="app auth-screen">
        <header className="auth-header">
          <h1>Supabase configuration missing</h1>
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

  const [messages, setMessages] = useState<MessageRow[]>([])
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

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
  }, [])

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, created_at, user_id, content, room_id, profiles(username)')
      .eq('room_id', 'general')
      .order('created_at', { ascending: true })
      .limit(200)

    if (error) {
      console.error(error)
      return
    }
    const rows = (data ?? []).map((row) => {
      const p = row.profiles
      const profile =
        p && !Array.isArray(p) ? p : Array.isArray(p) && p[0] ? p[0] : null
      return { ...row, profiles: profile } as MessageRow
    })
    setMessages(rows)
  }, [])

  useEffect(() => {
    if (!session) {
      setMessages([])
      return
    }
    void loadMessages()

    // No `filter` on postgres_changes: text filters like room_id=eq.general often
    // fail to match on the server; filter client-side instead.
    const channel = supabase
      .channel('messages-general')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const row = payload.new as Omit<MessageRow, 'profiles'>
          if (row.room_id !== 'general') return
          void (async () => {
            const { data: prof } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', row.user_id)
              .maybeSingle()
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev
              return [
                ...prev,
                {
                  ...row,
                  profiles: prof ?? { username: 'user' },
                },
              ]
            })
          })()
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') return
        if (status === 'CHANNEL_ERROR') {
          console.error('Realtime subscription failed', err)
        }
      })

    // If Realtime is off or blocked, still pick up others' messages without manual refresh.
    const pollMs = 3500
    const poll = () => {
      if (document.visibilityState === 'visible') void loadMessages()
    }
    const interval = window.setInterval(poll, pollMs)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void loadMessages()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase.removeChannel(channel)
    }
  }, [session, loadMessages])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

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
    setSendError(null)
    await supabase.auth.signOut()
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !session?.user) return
    setSendError(null)
    const { data, error } = await supabase
      .from('messages')
      .insert({
        user_id: session.user.id,
        content: text,
        room_id: 'general',
      })
      .select('id, created_at, user_id, content, room_id, profiles(username)')
      .single()
    if (error) {
      setSendError(error.message)
      return
    }
    if (data) {
      const p = data.profiles
      const profile =
        p && !Array.isArray(p) ? p : Array.isArray(p) && p[0] ? p[0] : null
      const row = { ...data, profiles: profile } as MessageRow
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev
        return [...prev, row]
      })
    }
    setDraft('')
  }

  if (!session) {
    return (
      <div className="app auth-screen">
        <header className="auth-header">
          <h1>Supabase chat</h1>
          <p className="lede">Sign in to join the shared lobby.</p>
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
                placeholder="How others see you"
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

  return (
    <div className="app chat-screen">
      <header className="chat-header">
        <div>
          <h1>Lobby</h1>
          <p className="meta">Signed in as {session.user.email}</p>
        </div>
        <button type="button" className="ghost" onClick={() => void handleSignOut()}>
          Sign out
        </button>
      </header>

      <div className="message-list" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="empty">No messages yet. Say hello.</p>
        ) : (
          messages.map((m) => (
            <article key={m.id} className="message">
              <div className="message-meta">
                <strong>{m.profiles?.username ?? '…'}</strong>
                <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
              </div>
              <p className="message-body">{m.content}</p>
            </article>
          ))
        )}
      </div>

      <form className="composer" onSubmit={(e) => void handleSend(e)}>
        {sendError && <p className="error">{sendError}</p>}
        <div className="composer-row">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            maxLength={4000}
            autoComplete="off"
          />
          <button type="submit" className="primary" disabled={!draft.trim()}>
            Send
          </button>
        </div>
      </form>
    </div>
  )
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
