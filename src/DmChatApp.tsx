import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

type DmInboxRow = {
  conversation_id: string
  updated_at: string
  other_user_id: string
  other_username: string
  last_content: string | null
  last_created_at: string | null
}

type GroupInboxRow = {
  group_chat_id: string
  name: string
  updated_at: string
  last_content: string | null
  last_created_at: string | null
}

type InboxItem =
  | ({ kind: 'dm' } & DmInboxRow)
  | ({ kind: 'group' } & GroupInboxRow)

type DmMessage = {
  id: string
  conversation_id: string
  created_at: string
  sender_id: string
  content: string
}

type GroupMessage = {
  id: string
  group_chat_id: string
  created_at: string
  sender_id: string
  content: string
  profiles: { username: string } | null
}

type ActiveChat =
  | { type: 'dm'; conversationId: string }
  | { type: 'group'; groupId: string }

type UserHit = { id: string; username: string }

type GroupMemberRow = {
  user_id: string
  joined_at: string
  username: string
}

type Props = {
  supabase: SupabaseClient
  session: Session
  onSignOut: () => void
}

export function DmChatApp({ supabase, session, onSignOut }: Props) {
  const me = session.user.id
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [active, setActive] = useState<ActiveChat | null>(null)
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([])
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchHits, setSearchHits] = useState<UserHit[]>([])
  const [searching, setSearching] = useState(false)
  const [peerTitle, setPeerTitle] = useState<string | null>(null)

  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [createSearch, setCreateSearch] = useState('')
  const [createHits, setCreateHits] = useState<UserHit[]>([])
  const [createSearching, setCreateSearching] = useState(false)
  const [pickedMembers, setPickedMembers] = useState<UserHit[]>([])

  const [addMembersOpen, setAddMembersOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addHits, setAddHits] = useState<UserHit[]>([])
  const [addSearching, setAddSearching] = useState(false)
  const [addPicked, setAddPicked] = useState<UserHit[]>([])

  const [groupMembersList, setGroupMembersList] = useState<GroupMemberRow[]>([])
  const [membersModalOpen, setMembersModalOpen] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const dmSearchInputRef = useRef<HTMLInputElement>(null)

  function startNewChat() {
    setActive(null)
    setPeerTitle(null)
    setSendError(null)
    setDraft('')
    dmSearchInputRef.current?.focus()
    dmSearchInputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const activeDmRow = active?.type === 'dm' ? inbox.find((r) => r.kind === 'dm' && r.conversation_id === active.conversationId) : undefined
  const activeGroupRow = active?.type === 'group' ? inbox.find((r) => r.kind === 'group' && r.group_chat_id === active.groupId) : undefined

  const chatTitle =
    active?.type === 'dm'
      ? (activeDmRow?.kind === 'dm' ? activeDmRow.other_username : null) ?? peerTitle
      : active?.type === 'group'
        ? (activeGroupRow?.kind === 'group' ? activeGroupRow.name : null)
        : null

  const loadGroupMembers = useCallback(
    async (groupId: string) => {
      const { data, error } = await supabase.rpc('list_group_members', {
        p_group_id: groupId,
      })
      if (error) {
        console.error('list_group_members', error)
        setGroupMembersList([])
        return
      }
      const rows = (data ?? []) as { user_id: string; username: string; joined_at: string }[]
      setGroupMembersList(
        rows.map((r) => ({
          user_id: r.user_id,
          username: r.username,
          joined_at: r.joined_at,
        }))
      )
    },
    [supabase]
  )

  useEffect(() => {
    if (active?.type !== 'group') {
      setGroupMembersList([])
      return
    }
    void loadGroupMembers(active.groupId)
  }, [active, loadGroupMembers])

  useEffect(() => {
    if (addMembersOpen && active?.type === 'group') {
      void loadGroupMembers(active.groupId)
    }
  }, [addMembersOpen, active, loadGroupMembers])

  const groupMemberIdSet = new Set(groupMembersList.map((m) => m.user_id))

  const loadInbox = useCallback(async () => {
    const [{ data: dms, error: e1 }, { data: groups, error: e2 }] = await Promise.all([
      supabase.rpc('list_my_dms'),
      supabase.rpc('list_my_group_chats'),
    ])
    if (e1) console.error(e1)
    if (e2) console.error(e2)
    const dmRows = (dms ?? []) as DmInboxRow[]
    const grRows = (groups ?? []) as GroupInboxRow[]
    const merged: InboxItem[] = [
      ...dmRows.map((r) => ({ kind: 'dm' as const, ...r })),
      ...grRows.map((r) => ({ kind: 'group' as const, ...r })),
    ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    setInbox(merged)
  }, [supabase])

  const loadDmMessages = useCallback(
    async (conversationId: string) => {
      const { data, error } = await supabase
        .from('direct_messages')
        .select('id, conversation_id, created_at, sender_id, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(500)
      if (error) {
        console.error(error)
        return
      }
      setDmMessages((data ?? []) as DmMessage[])
      setGroupMessages([])
    },
    [supabase]
  )

  const loadGroupMessages = useCallback(
    async (groupId: string) => {
      const { data, error } = await supabase
        .from('group_messages')
        .select('id, group_chat_id, sender_id, content, created_at, profiles(username)')
        .eq('group_chat_id', groupId)
        .order('created_at', { ascending: true })
        .limit(500)
      if (error) {
        console.error(error)
        return
      }
      const rows = (data ?? []).map((row) => {
        const p = row.profiles
        const profile =
          p && !Array.isArray(p) ? p : Array.isArray(p) && p[0] ? p[0] : null
        return { ...row, profiles: profile } as GroupMessage
      })
      setGroupMessages(rows)
      setDmMessages([])
    },
    [supabase]
  )

  useEffect(() => {
    void loadInbox()
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadInbox()
    }, 4000)
    return () => window.clearInterval(t)
  }, [loadInbox])

  useEffect(() => {
    if (!active) {
      setDmMessages([])
      setGroupMessages([])
      return
    }
    if (active.type === 'dm') {
      void loadDmMessages(active.conversationId)
    } else {
      void loadGroupMessages(active.groupId)
    }
  }, [active, loadDmMessages, loadGroupMessages])

  useEffect(() => {
    if (!active) return
    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (active.type === 'dm') void loadDmMessages(active.conversationId)
      else void loadGroupMessages(active.groupId)
    }, 3500)

    const channel = supabase.channel(`chat-${active.type}-${active.type === 'dm' ? active.conversationId : active.groupId}`)
    if (active.type === 'dm') {
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        (payload) => {
          const row = payload.new as DmMessage
          if (row.conversation_id !== active.conversationId) return
          setDmMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, row]
          })
          void loadInbox()
        }
      )
    } else {
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages' },
        (payload) => {
          const row = payload.new as GroupMessage
          if (row.group_chat_id !== active.groupId) return
          void (async () => {
            const { data: prof } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', row.sender_id)
              .maybeSingle()
            const enriched: GroupMessage = {
              ...row,
              profiles: prof ?? { username: 'user' },
            }
            setGroupMessages((prev) => {
              if (prev.some((m) => m.id === enriched.id)) return prev
              return [...prev, enriched]
            })
            void loadInbox()
          })()
        }
      )
    }
    channel.subscribe()

    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [active, loadDmMessages, loadGroupMessages, loadInbox, supabase])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [dmMessages.length, groupMessages.length])

  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
      setSearchHits([])
      return
    }
    setSearching(true)
    const h = window.setTimeout(() => {
      void searchProfiles(supabase, q, me, setSearchHits, setSearching)
    }, 300)
    return () => window.clearTimeout(h)
  }, [search, supabase, me])

  useEffect(() => {
    const q = createSearch.trim()
    if (q.length < 2) {
      setCreateHits([])
      return
    }
    setCreateSearching(true)
    const h = window.setTimeout(() => {
      void searchProfiles(supabase, q, me, setCreateHits, setCreateSearching, pickedMembers)
    }, 300)
    return () => window.clearTimeout(h)
  }, [createSearch, supabase, me, pickedMembers])

  useEffect(() => {
    const q = addSearch.trim()
    if (q.length < 2) {
      setAddHits([])
      return
    }
    setAddSearching(true)
    const h = window.setTimeout(() => {
      void searchProfiles(supabase, q, me, setAddHits, setAddSearching, addPicked)
    }, 300)
    return () => window.clearTimeout(h)
  }, [addSearch, supabase, me, addPicked])

  async function openOrCreateDm(otherId: string, otherName: string) {
    const { data: cid, error } = await supabase.rpc('get_or_create_dm', { p_other: otherId })
    if (error) {
      console.error(error)
      return
    }
    setPeerTitle(otherName)
    setSearch('')
    setSearchHits([])
    await loadInbox()
    setActive({ type: 'dm', conversationId: cid as string })
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !active) return
    setSendError(null)
    if (active.type === 'dm') {
      const { error } = await supabase.from('direct_messages').insert({
        conversation_id: active.conversationId,
        sender_id: me,
        content: text,
      })
      if (error) {
        setSendError(error.message)
        return
      }
    } else {
      const { error } = await supabase.from('group_messages').insert({
        group_chat_id: active.groupId,
        sender_id: me,
        content: text,
      })
      if (error) {
        setSendError(error.message)
        return
      }
    }
    setDraft('')
    void loadInbox()
  }

  function pickMember(u: UserHit, list: UserHit[], setList: (v: UserHit[]) => void) {
    if (list.some((x) => x.id === u.id)) return
    setList([...list, u])
  }

  function removePicked(id: string, list: UserHit[], setList: (v: UserHit[]) => void) {
    setList(list.filter((x) => x.id !== id))
  }

  async function submitCreateGroup() {
    const name = groupName.trim()
    if (!name) return
    const ids = pickedMembers.map((p) => p.id)
    const { data: gid, error } = await supabase.rpc('create_group_chat', {
      p_name: name,
      p_member_ids: ids,
    })
    if (error) {
      console.error(error)
      setSendError(error.message)
      return
    }
    setCreateGroupOpen(false)
    setGroupName('')
    setPickedMembers([])
    setCreateSearch('')
    setCreateHits([])
    await loadInbox()
    setActive({ type: 'group', groupId: gid as string })
  }

  async function submitAddMembers() {
    if (active?.type !== 'group') return
    const ids = addPicked.map((p) => p.id)
    if (ids.length === 0) {
      setAddMembersOpen(false)
      return
    }
    const { error } = await supabase.rpc('add_group_members', {
      p_group_id: active.groupId,
      p_user_ids: ids,
    })
    if (error) {
      console.error(error)
      setSendError(error.message)
      return
    }
    setAddMembersOpen(false)
    setAddPicked([])
    setAddSearch('')
    setAddHits([])
    void loadInbox()
    if (active?.type === 'group') void loadGroupMembers(active.groupId)
  }

  const isDmActive = active?.type === 'dm'

  return (
    <div className="dm-layout">
      <aside className="dm-sidebar" aria-label="Chats">
        <div className="dm-sidebar-head">
          <div className="dm-sidebar-title-row">
            <h1 className="dm-brand">Chats</h1>
            <button type="button" className="ghost dm-signout" onClick={() => void onSignOut()}>
              Sign out
            </button>
          </div>
          <p className="dm-you">{session.user.email}</p>
          <div className="dm-actions-row">
            <button type="button" className="primary dm-action-btn" onClick={startNewChat}>
              New chat
            </button>
            <button type="button" className="primary dm-action-btn" onClick={() => setCreateGroupOpen(true)}>
              New group
            </button>
          </div>
          <label className="dm-search">
            <span className="visually-hidden">Search people by username</span>
            <input
              ref={dmSearchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user for direct chat…"
              autoComplete="off"
            />
          </label>
          {search.trim().length >= 2 && (
            <div className="dm-search-results">
              {searching ? (
                <p className="dm-hint">Searching…</p>
              ) : searchHits.length === 0 ? (
                <p className="dm-hint">No users found</p>
              ) : (
                <ul>
                  {searchHits.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="dm-user-pick"
                        onClick={() => void openOrCreateDm(u.id, u.username)}
                      >
                        {u.username}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <nav className="dm-inbox">
          {inbox.length === 0 ? (
            <p className="dm-empty-sidebar">No chats yet. Search someone or create a group.</p>
          ) : (
            inbox.map((row) => {
              const key = row.kind === 'dm' ? row.conversation_id : row.group_chat_id
              const isActive =
                active?.type === 'dm' && row.kind === 'dm'
                  ? active.conversationId === row.conversation_id
                  : active?.type === 'group' && row.kind === 'group'
                    ? active.groupId === row.group_chat_id
                    : false
              const title = row.kind === 'dm' ? row.other_username : row.name
              const preview =
                row.kind === 'dm'
                  ? row.last_content
                  : row.last_content
              const time = row.kind === 'dm' ? row.last_created_at : row.last_created_at
              return (
                <button
                  key={`${row.kind}-${key}`}
                  type="button"
                  className={`dm-thread ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setPeerTitle(null)
                    if (row.kind === 'dm') {
                      setActive({ type: 'dm', conversationId: row.conversation_id })
                    } else {
                      setActive({ type: 'group', groupId: row.group_chat_id })
                    }
                  }}
                >
                  <span className="dm-thread-kind">{row.kind === 'group' ? 'Group' : 'Direct'}</span>
                  <div className="dm-thread-top">
                    <span className="dm-thread-name">{title}</span>
                    <span className="dm-thread-time">{time ? shortTime(time) : ''}</span>
                  </div>
                  <span className="dm-thread-preview">
                    {preview ? truncate(preview, 40) : 'No messages yet'}
                  </span>
                </button>
              )
            })
          )}
        </nav>
      </aside>

      <main className="dm-main">
        {!active || !chatTitle ? (
          <div className="dm-empty-main">
            <p>Select a chat, search for a user, or create a group.</p>
          </div>
        ) : (
          <>
            <header className="dm-chat-head">
              <h2>{chatTitle}</h2>
              {active.type === 'group' && (
                <div className="dm-chat-actions">
                  <button
                    type="button"
                    className="ghost dm-chat-action-btn"
                    onClick={() => {
                      void loadGroupMembers(active.groupId)
                      setMembersModalOpen(true)
                    }}
                  >
                    Members
                  </button>
                  <button
                    type="button"
                    className="ghost dm-chat-action-btn"
                    onClick={() => {
                      void loadGroupMembers(active.groupId)
                      setAddMembersOpen(true)
                    }}
                  >
                    Add people
                  </button>
                </div>
              )}
            </header>
            <div className="dm-thread-scroll" ref={listRef} role="log" aria-live="polite">
              {isDmActive ? (
                dmMessages.length === 0 ? (
                  <p className="empty">No messages yet. Say hello.</p>
                ) : (
                  dmMessages.map((m) => (
                    <div key={m.id} className={`dm-bubble-wrap ${m.sender_id === me ? 'mine' : 'theirs'}`}>
                      <article className="dm-bubble">
                        <p className="dm-bubble-text">{m.content}</p>
                        <time className="dm-bubble-time" dateTime={m.created_at}>
                          {shortTime(m.created_at)}
                        </time>
                      </article>
                    </div>
                  ))
                )
              ) : groupMessages.length === 0 ? (
                <p className="empty">No messages yet. Say hello.</p>
              ) : (
                groupMessages.map((m) => (
                  <div key={m.id} className={`dm-bubble-wrap ${m.sender_id === me ? 'mine' : 'theirs'}`}>
                    <article className="dm-bubble">
                      {m.sender_id !== me && (
                        <span className="dm-bubble-sender">{m.profiles?.username ?? '…'}</span>
                      )}
                      <p className="dm-bubble-text">{m.content}</p>
                      <time className="dm-bubble-time" dateTime={m.created_at}>
                        {shortTime(m.created_at)}
                      </time>
                    </article>
                  </div>
                ))
              )}
            </div>
            <form className="composer dm-composer" onSubmit={(e) => void handleSend(e)}>
              {sendError && <p className="error">{sendError}</p>}
              <div className="composer-row">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Message…"
                  maxLength={4000}
                  autoComplete="off"
                />
                <button type="submit" className="primary" disabled={!draft.trim()}>
                  Send
                </button>
              </div>
            </form>
          </>
        )}
      </main>

      {createGroupOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="new-group-title">
          <div className="modal-card">
            <h2 id="new-group-title">New group</h2>
            <label className="field">
              <span>Group name</span>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Family, Team…"
                maxLength={100}
                autoFocus
              />
            </label>
            <p className="modal-hint">Search usernames to add people (optional).</p>
            <label className="field">
              <span>Add members</span>
              <input
                value={createSearch}
                onChange={(e) => setCreateSearch(e.target.value)}
                placeholder="Search username…"
                autoComplete="off"
              />
            </label>
            {createSearch.trim().length >= 2 && (
              <ul className="modal-hit-list">
                {createSearching ? (
                  <li className="dm-hint">Searching…</li>
                ) : (
                  createHits.map((u) => {
                    const already = pickedMembers.some((p) => p.id === u.id)
                    return (
                      <li key={u.id}>
                        {already ? (
                          <div className="dm-user-pick dm-user-pick--disabled" aria-disabled>
                            {u.username}
                            <span className="dm-pick-note">Already added</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="dm-user-pick"
                            onClick={() => pickMember(u, pickedMembers, setPickedMembers)}
                          >
                            {u.username} — add
                          </button>
                        )}
                      </li>
                    )
                  })
                )}
              </ul>
            )}
            {pickedMembers.length > 0 && (
              <div className="chip-row">
                {pickedMembers.map((u) => (
                  <span key={u.id} className="chip">
                    {u.username}
                    <button type="button" aria-label={`Remove ${u.username}`} onClick={() => removePicked(u.id, pickedMembers, setPickedMembers)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setCreateGroupOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary" disabled={!groupName.trim()} onClick={() => void submitCreateGroup()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {membersModalOpen && active?.type === 'group' && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="members-title">
          <div className="modal-card modal-card--members">
            <h2 id="members-title">Members — {chatTitle}</h2>
            <p className="modal-hint">{groupMembersList.length} people in this group</p>
            <ul className="members-list">
              {groupMembersList.map((m) => (
                <li key={m.user_id} className="members-list-item">
                  <span className="members-name">
                    {m.username}
                    {m.user_id === me ? ' (you)' : ''}
                  </span>
                  <span className="members-joined">Joined {shortTime(m.joined_at)}</span>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button type="button" className="primary" onClick={() => setMembersModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {addMembersOpen && active?.type === 'group' && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="add-members-title">
          <div className="modal-card">
            <h2 id="add-members-title">Add people to {chatTitle}</h2>
            <label className="field">
              <span>Search username</span>
              <input
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search…"
                autoComplete="off"
                autoFocus
              />
            </label>
            {addSearch.trim().length >= 2 && (
              <ul className="modal-hit-list">
                {addSearching ? (
                  <li className="dm-hint">Searching…</li>
                ) : (
                  addHits.map((u) => {
                    const inGroup = groupMemberIdSet.has(u.id)
                    const staged = addPicked.some((p) => p.id === u.id)
                    return (
                      <li key={u.id}>
                        {inGroup ? (
                          <div className="dm-user-pick dm-user-pick--disabled" aria-disabled>
                            {u.username}
                            <span className="dm-pick-note">In group</span>
                          </div>
                        ) : staged ? (
                          <div className="dm-user-pick dm-user-pick--disabled" aria-disabled>
                            {u.username}
                            <span className="dm-pick-note">Ready to add</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="dm-user-pick"
                            onClick={() => pickMember(u, addPicked, setAddPicked)}
                          >
                            {u.username} — add
                          </button>
                        )}
                      </li>
                    )
                  })
                )}
              </ul>
            )}
            {addPicked.length > 0 && (
              <div className="chip-row">
                {addPicked.map((u) => (
                  <span key={u.id} className="chip">
                    {u.username}
                    <button type="button" aria-label={`Remove ${u.username}`} onClick={() => removePicked(u.id, addPicked, setAddPicked)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setAddMembersOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={() => void submitAddMembers()}>
                {addPicked.length === 0 ? 'Done' : 'Add to group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

async function searchProfiles(
  supabase: SupabaseClient,
  q: string,
  me: string,
  setHits: (h: UserHit[]) => void,
  setBusy: (b: boolean) => void,
  exclude: UserHit[] = []
) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', `%${q}%`)
    .neq('id', me)
    .order('username')
    .limit(20)
  setBusy(false)
  if (error) {
    console.error(error)
    setHits([])
    return
  }
  const ex = new Set(exclude.map((e) => e.id))
  setHits((data ?? []).filter((u) => !ex.has(u.id)))
}

function truncate(s: string, n: number) {
  const t = s.trim()
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}

function shortTime(iso: string) {
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
