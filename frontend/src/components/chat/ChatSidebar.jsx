import { memo, useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const ChatSidebar = memo(function ChatSidebar({
  sidebarRef, chatHistory, currentChatId, userData,
  onNewChat, onDeleteChat, onRenameChat, onTogglePin,
  onOpenSettings, onCloseSidebar, collapsed,
}) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef(null)

  // Flatten all chats, preserving order: pinned, today, yesterday, older
  const allChats = useMemo(() => {
    const groups = [
      { key: 'pinned', label: 'Pinned' },
      { key: 'today', label: 'Today' },
      { key: 'yesterday', label: 'Yesterday' },
      { key: 'older', label: 'Older' },
    ]
    let merged = []
    for (const { key, label } of groups) {
      const items = chatHistory[key] || []
      for (const c of items) merged.push({ ...c, group: label })
    }
    if (!searchQuery.trim()) return merged
    const q = searchQuery.toLowerCase()
    return merged.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.created_at || '').toLowerCase().includes(q)
    )
  }, [chatHistory, searchQuery])

  const grouped = useMemo(() => {
    const map = {}
    for (const c of allChats) {
      if (!map[c.group]) map[c.group] = []
      map[c.group].push(c)
    }
    return map
  }, [allChats])

  // Start inline rename
  const startRename = useCallback((e, chat) => {
    e.stopPropagation()
    setEditingId(chat.id)
    setEditValue(chat.title || chat.created_at || '')
    setTimeout(() => {
      editRef.current?.focus()
      editRef.current?.select()
    }, 20)
  }, [])

  // Submit rename
  const submitRename = useCallback((chatId) => {
    const val = editValue.trim()
    if (val) {
      onRenameChat?.(chatId, val)
    }
    setEditingId(null)
    setEditValue('')
  }, [editValue, onRenameChat])

  // Cancel rename
  const cancelRename = useCallback(() => {
    setEditingId(null)
    setEditValue('')
  }, [])

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} ref={sidebarRef}>
      <div className="sidebar-header">
        <div className="sidebar-brand" onClick={onNewChat} title="New Chat">
          <img src="/icon.svg" alt="MBK" className="sidebar-logo" />
          <span>MBK Chat</span>
        </div>
        <button className="btn-sidebar-close" onClick={onCloseSidebar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className="sidebar-new-chat-wrap">
        <button className="btn-new-chat" onClick={onNewChat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>New Chat</span>
        </button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <svg className="sidebar-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" className="sidebar-search-input" placeholder="Search chats by name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        {searchQuery && (
          <button className="sidebar-search-clear" onClick={() => setSearchQuery('')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      {/* Chat List */}
      <div className="chat-list">
        {allChats.length === 0 && (
          <div className="chat-list-empty">{searchQuery ? 'No chats match your search' : 'No conversations yet'}</div>
        )}
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} className="chat-group">
            <div className="chat-group-title">{group}</div>
            {items.map(chat => {
              const isActive = String(chat.id) === String(currentChatId)
              const isEditing = editingId === chat.id
              const displayTitle = chat.title || chat.created_at || 'Untitled'

              return (
                <div key={chat.id}
                  className={`chat-item ${isActive ? 'active' : ''} ${chat.is_pinned ? 'pinned' : ''}`}
                  onClick={() => { if (!isEditing) navigate(`/chatbot/${chat.id}`) }}
                >
                  {/* Pin indicator */}
                  {chat.is_pinned && (
                    <svg className="chat-item-pin" width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                    </svg>
                  )}

                  {/* Inline rename or display */}
                  {isEditing ? (
                    <input
                      ref={editRef}
                      className="chat-item-rename-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') submitRename(chat.id)
                        if (e.key === 'Escape') cancelRename()
                      }}
                      onBlur={() => submitRename(chat.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="chat-item-title">{displayTitle}</span>
                  )}

                  {/* Action buttons (appear on hover) */}
                  <div className="chat-item-actions">
                    {/* Pin toggle */}
                    <button className="chat-item-action" onClick={(e) => { e.stopPropagation(); onTogglePin?.(chat.id) }} title={chat.is_pinned ? 'Unpin' : 'Pin'}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 002-2H6a2 2 0 002 2h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/></svg>
                    </button>
                    {/* Rename */}
                    <button className="chat-item-action" onClick={(e) => startRename(e, chat)} title="Rename">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    {/* Delete */}
                    <button className="chat-item-action chat-item-action--danger" onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this chat permanently?')) onDeleteChat(chat.id, e) }} title="Delete">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={onOpenSettings} title="Account & Settings">
          <div className="user-avatar">{userData.username ? userData.username[0]?.toUpperCase() : 'U'}</div>
          <div className="user-info">
            <div className="user-name">{userData.username || 'User'}</div>
            <div className="user-email-trunc">{userData.role || 'USER'}</div>
          </div>
        </div>
        <button className="btn-settings" onClick={onOpenSettings} title="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </button>
      </div>
    </aside>
  )
})

export default ChatSidebar

