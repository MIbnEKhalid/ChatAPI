import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import MatrixRain from '../components/MatrixRain.jsx'
import SettingsModal from '../components/SettingsModal.jsx'
import { useToast } from '../hooks/useToast.jsx'
import { useSettings } from '../hooks/useSettings.js'
import { useChat } from '../hooks/useChat.js'

// Sub-components
import ChatSidebar from '../components/chat/ChatSidebar.jsx'
import ChatTopBar from '../components/chat/ChatTopBar.jsx'
import ChatMessages from '../components/chat/ChatMessages.jsx'
import ChatInput from '../components/chat/ChatInput.jsx'
import ChatEmpty from '../components/chat/ChatEmpty.jsx'

export default function Chatbot() {
  const { chatId } = useParams()
  const { showToast, ToastContainer } = useToast()
  const { settings, updateSettings } = useSettings()

  // --- Chat state via custom hook ---
  const {
    messages, isWaiting, editingNodeId,
    chatHistory, chatLoading, sessionChecked,
    setSessionChecked, setCurrentChatId, loadHistory, loadChat,
    sendMessage, deleteChat, newChat, startEdit, cancelEdit,
    renameChat, togglePin,
  } = useChat(chatId, null, settings, showToast)

  // --- Local UI state ---
  const [inputValue, setInputValue] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('mbk_sidebar_collapsed') === 'true'
  })
  const [userData, setUserData] = useState({
    username: '', role: '',
    limits: { messageCount: 0, dailyLimit: 100 }
  })

  const messagesRef = useRef(null)
  const inputRef = useRef(null)
  const sidebarRef = useRef(null)

  // --- Init: fetch session + history ---
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const res = await fetch('/api/user/session')
        if (res.status === 401) {
          const cp = window.location.pathname + window.location.search
          window.location.href = `/mbkauthe/login?redirect=${encodeURIComponent(cp)}`
          return
        }
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setUserData(data)
      } catch (e) {
        if (!e.message?.includes('redirecting')) console.error('Session error:', e)
        return
      }
      if (!cancelled) {
        setSessionChecked(true)
        loadHistory()
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  // --- Reload chat on URL param change ---
  useEffect(() => {
    if (!sessionChecked || !chatId) return
    setCurrentChatId(chatId)
    loadChat(chatId)
  }, [chatId, sessionChecked])

  // --- Font size ---
  useEffect(() => {
    document.documentElement.style.fontSize = settings.fontSize + 'px'
  }, [settings.fontSize])

  // --- Color scheme (light/dark) ---
  useEffect(() => {
    const html = document.documentElement
    if (settings.colorScheme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }, [settings.colorScheme])

  // --- Auto-scroll ---
  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages])

  // --- Sidebar splitter ---
  useEffect(() => {
    const s = document.getElementById('splitter')
    if (!s) return
    const r = document.documentElement, key = 'mbk_sidebar_width'
    const minW = 200, maxW = Math.min(window.innerWidth - 300, 600)
    const defaultW = 280
    const v = parseInt(localStorage.getItem(key))
    if (v && !isNaN(v)) r.style.setProperty('--sidebar-width', v + 'px')

    // Double-click splitter to reset to default width
    const dblClick = () => {
      r.style.setProperty('--sidebar-width', defaultW + 'px')
      localStorage.setItem(key, defaultW)
    }
    s.addEventListener('dblclick', dblClick)

    let d = false
    const mm = (e) => { if (!d) return; const w = Math.max(minW, Math.min(maxW, e.clientX)); r.style.setProperty('--sidebar-width', w + 'px'); localStorage.setItem(key, w) }
    const mu = () => { if (d) { d = false; document.body.classList.remove('resizing'); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu) } }
    s.addEventListener('mousedown', (e) => { e.preventDefault(); d = true; document.body.classList.add('resizing'); window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu) })
    return () => {
      window.removeEventListener('mousemove', mm)
      window.removeEventListener('mouseup', mu)
      s.removeEventListener('dblclick', dblClick)
    }
  }, [])

  // --- Ctrl+B keyboard shortcut for sidebar ---
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarCollapsed(prev => {
          const next = !prev
          localStorage.setItem('mbk_sidebar_collapsed', next)
          return next
        })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // --- Handlers ---
  const handleSend = useCallback(async () => {
    const t = inputValue.trim()
    if (!t || isWaiting) return
    setInputValue('')
    const r = await sendMessage(t)
    if (r?.limits) setUserData(p => ({ ...p, limits: r.limits }))
  }, [inputValue, isWaiting, sendMessage])

  const handleSuggestion = useCallback((text) => {
    setInputValue(text)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const toggleSidebar = useCallback(() => {
    // On mobile (< 768px), toggle overlay; on desktop, toggle collapse
    if (window.innerWidth < 768) {
      sidebarRef.current?.classList.toggle('open')
      return
    }
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem('mbk_sidebar_collapsed', next)
      return next
    })
  }, [])

  const closeSidebarMobile = useCallback(() => {
    // Only used for mobile overlay close
    sidebarRef.current?.classList.remove('open')
  }, [])

  // --- API Key ---
  const saveApiKey = useCallback(async (prov) => {
    const inp = document.getElementById(`api-key-${prov}`)
    if (!inp) return
    const k = inp.value.trim()
    if (!k) { showToast('Enter a key or use Clear to remove it.', 'error'); return }
    try {
      const res = await fetch('/api/user/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: prov, apiKey: k }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message || 'Save failed')
      inp.value = ''; inp.placeholder = 'Saved key configured'
      showToast(`${prov.toUpperCase()} key saved`, 'success')
    } catch (e) { showToast(e.message, 'error') }
  }, [showToast])

  const clearApiKey = useCallback(async (prov) => {
    try {
      const res = await fetch('/api/user/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: prov, apiKey: '' }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message || 'Clear failed')
      const inp = document.getElementById(`api-key-${prov}`)
      if (inp) { inp.value = ''; inp.placeholder = 'Enter API key' }
      showToast(`${prov.toUpperCase()} key cleared`, 'success')
    } catch (e) { showToast(e.message, 'error') }
  }, [showToast])

  const modelName = (settings.model || '').split('/').pop()?.toUpperCase() || 'DEEPSEEK V4 FLASH'

  // --- Loading ---
  if (!sessionChecked) {
    return (
      <div className="session-loading">
        <div className="typing-dots"><span></span><span></span><span></span></div>
        <div className="session-loading-text">CHECKING SESSION...</div>
      </div>
    )
  }

  return (
    <>
      <MatrixRain enabled={settings.matrixEnabled} />
      <div className="scanlines"></div>

      <div id="app-root">
        <ChatSidebar
          sidebarRef={sidebarRef}
          chatHistory={chatHistory}
          currentChatId={chatId || null}
          userData={userData}
          onNewChat={newChat}
          onDeleteChat={deleteChat}
          onRenameChat={renameChat}
          onTogglePin={togglePin}
          onOpenSettings={() => setShowSettings(true)}
          onCloseSidebar={closeSidebarMobile}
          collapsed={sidebarCollapsed}
        />

        <div id="splitter" className="splitter"></div>

        <section className="main-content">
          <ChatTopBar modelName={modelName} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} settings={settings} updateSettings={updateSettings} />

          {messages.length === 0 && !chatLoading ? (
            /* Empty state: welcome + centered input */
            <div className="messages-container messages-container--centered" ref={messagesRef}>
              <ChatEmpty username={userData.username} onSuggestion={handleSuggestion} />
              <ChatInput
                inputValue={inputValue}
                setInputValue={setInputValue}
                isWaiting={isWaiting}
                editingNodeId={editingNodeId}
                onSend={handleSend}
                onCancelEdit={cancelEdit}
                inputRef={inputRef}
              />
            </div>
          ) : (
            <>
              <ChatMessages
                messages={messages}
                isWaiting={isWaiting}
                chatLoading={chatLoading}
                username={userData.username}
                onStartEdit={startEdit}
                onSuggestion={handleSuggestion}
                showToast={showToast}
                messagesRef={messagesRef}
              />
              <ChatInput
                inputValue={inputValue}
                setInputValue={setInputValue}
                isWaiting={isWaiting}
                editingNodeId={editingNodeId}
                onSend={handleSend}
                onCancelEdit={cancelEdit}
                inputRef={inputRef}
              />
            </>
          )}
        </section>
      </div>

      {/* Settings */}
      <SettingsModal
        settings={settings}
        updateSettings={updateSettings}
        showToast={showToast}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      >
        <AccountPanel userData={userData} saveApiKey={saveApiKey} clearApiKey={clearApiKey} />
      </SettingsModal>

      <ToastContainer />
    </>
  )
}

// ── Inline account panel ──
function AccountPanel({ userData, saveApiKey, clearApiKey }) {
  const unlim = userData.role === 'Admin' || userData.role === 'superadmin'
  const pct = unlim ? 100 : Math.min((userData.limits.messageCount / userData.limits.dailyLimit) * 100, 100)
  return (
    <>
      <div className="account-card">
        <div className="account-avatar-lg">{userData.username?.[0]?.toUpperCase() || 'U'}</div>
        <h3 className="account-name">{userData.username || 'User'}</h3>
        <p className="account-role">Role: {userData.role || 'USER'}</p>
        <div className="quota-section">
          <label className="quota-label">Daily Message Quota</label>
          <div className="limit-bar-bg">
            <div className="limit-bar-fill" style={{ width: `${pct}%`, background: pct > 90 && !unlim ? 'var(--neon-red)' : undefined }}></div>
          </div>
          <div className="quota-stats"><span>Used: {userData.limits.messageCount}</span><span>Limit: {unlim ? 'UNLIMITED' : userData.limits.dailyLimit}</span></div>
        </div>
      </div>
      <div className="api-key-section">
        <label className="api-key-label">Your own DeepSeek API token (encrypted)</label>
        <div className="provider-key-row">
          <span className="provider-name">DeepSeek</span>
          <input type="password" className="form-control" id="api-key-deepseek" placeholder="Enter DeepSeek API token" />
          <button className="btn btn-secondary" onClick={() => saveApiKey('deepseek')}>Save</button>
          <button className="btn btn-secondary btn-clear" onClick={() => clearApiKey('deepseek')}>Clear</button>
        </div>
        <small className="api-key-note">Your token is encrypted on the server. Used for DeepSeek requests when available.</small>
      </div>
      <div className="settings-actions">
        <button onClick={() => { window.location.href = '/mbkauthe/api/logout' }} className="btn btn-danger btn-full"><i className="fas fa-sign-out-alt"></i> Logout</button>
        <button onClick={() => window.open('https://portal.mbktech.org', '_blank')} className="btn btn-secondary btn-full"><i className="fas fa-id-card"></i> Open Account Portal</button>
      </div>
    </>
  )
}
