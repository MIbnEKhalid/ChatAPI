import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from './useApi.js'

/**
 * Centralized chat-state hook.
 * Manages messages, treeData, sendMessage, history loading, etc.
 */
export function useChat(chatId, userData, settings, showToast) {
  const navigate = useNavigate()
  const { apiFetch } = useApi()

  const [messages, setMessages] = useState([])
  const [treeData, setTreeData] = useState({ nodes: {}, rootId: null, currentLeafId: null })
  const [currentChatId, setCurrentChatId] = useState(chatId || null)
  const [isWaiting, setIsWaiting] = useState(false)
  const [editingNodeId, setEditingNodeId] = useState(null)
  const [chatHistory, setChatHistory] = useState({ pinned: [], today: [], yesterday: [], older: [] })
  const [chatLoading, setChatLoading] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)

  const abortRef = useRef(null)

  // ---- History ----
  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch('/api/chat/histories')
      const data = await res.json()
      setChatHistory(data)
    } catch (e) { console.error('History error:', e) }
  }, [apiFetch])

  // ---- Load a single chat ----
  const loadChat = useCallback(async (id) => {
    setChatLoading(true)
    setCurrentChatId(id)
    setMessages([])
    try {
      const res = await apiFetch(`/api/chat/histories/${id}`)
      const data = await res.json()
      if (data.treeData) {
        setTreeData(data.treeData)
        renderMessagesFromTree(data.treeData)
      }
    } catch (e) {
      console.error('Load chat error:', e)
      showToast('Failed to load chat', 'error')
    } finally {
      setChatLoading(false)
    }
  }, [apiFetch, showToast])

  // ---- Walk tree → flat messages ----
  const walkTreeToMessages = useCallback((tree) => {
    if (!tree || !tree.nodes) return []
    const nodes = tree.nodes
    let currentId = tree.currentLeafId
    const path = []
    while (currentId) {
      path.unshift(currentId)
      currentId = nodes[currentId]?.parentId
    }
    // Fallback: walk from root
    if (path.length === 0 && tree.rootId) {
      let id = tree.rootId
      while (id) {
        path.push(id)
        const children = Object.entries(nodes).filter(([, n]) => n.parentId === id)
        id = children[0]?.[0]
      }
    }
    return path.map(id => ({
      id,
      role: nodes[id]?.role,
      content: nodes[id]?.text || '',
    }))
  }, [])

  const renderMessagesFromTree = useCallback((tree) => {
    setMessages(walkTreeToMessages(tree))
  }, [walkTreeToMessages])

  // ---- Send message ----
  const sendMessage = useCallback(async (text) => {
    if (!text || isWaiting) return

    let parentId = treeData.currentLeafId
    if (editingNodeId && treeData.nodes[editingNodeId]) {
      parentId = treeData.nodes[editingNodeId].parentId
    }

    setEditingNodeId(null)
    setIsWaiting(true)

    const tempUserMsg = { id: 'user-' + Date.now(), role: 'user', content: text }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const res = await apiFetch('/api/bot-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          chatId: currentChatId,
          parentMessageId: parentId,
          model: settings.model,
          temperature: settings.temperature,
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Error')

      setTreeData(data.treeData)
      setCurrentChatId(data.newChatId)

      const msgList = walkTreeToMessages(data.treeData)
      setMessages(msgList)
      loadHistory()

      if (data.newChatId && String(data.newChatId) !== String(currentChatId)) {
        navigate(`/chatbot/${data.newChatId}`, { replace: true })
      }

      return data // caller can use limits etc.
    } catch (e) {
      showToast(e.message, 'error')
      setMessages(prev => prev.filter(m => !m.id.startsWith('user-')))
    } finally {
      setIsWaiting(false)
    }
  }, [isWaiting, treeData, editingNodeId, apiFetch, currentChatId, settings, navigate, walkTreeToMessages, loadHistory, showToast])

  // ---- Delete chat ----
  const deleteChat = useCallback(async (id, e) => {
    if (e) e.stopPropagation()
    try {
      const res = await apiFetch(`/api/chat/clear-history/${id}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        if (String(id) === String(currentChatId)) {
          navigate('/chatbot', { replace: true })
          setCurrentChatId(null)
          setMessages([])
          setTreeData({ nodes: {}, rootId: null, currentLeafId: null })
        }
        loadHistory()
        showToast('Chat moved to trash', 'success')
      } else {
        showToast(data.message || 'Failed', 'error')
      }
    } catch (e) { showToast(e.message, 'error') }
  }, [apiFetch, currentChatId, navigate, loadHistory, showToast])

  // ---- New chat ----
  const newChat = useCallback(() => {
    navigate('/chatbot', { replace: true })
    setCurrentChatId(null)
    setMessages([])
    setTreeData({ nodes: {}, rootId: null, currentLeafId: null })
  }, [navigate])

  // ---- Edit ----
  const startEdit = useCallback((nodeId) => {
    setEditingNodeId(nodeId)
  }, [])

  const cancelEdit = useCallback(() => setEditingNodeId(null), [])

  // ---- Rename chat ----
  const renameChat = useCallback(async (id, newTitle) => {
    try {
      const res = await apiFetch(`/api/chat/histories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', title: newTitle })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Rename failed')
      loadHistory()
      showToast('Chat renamed', 'success')
    } catch (e) { showToast(e.message, 'error') }
  }, [apiFetch, loadHistory, showToast])

  // ---- Toggle pin ----
  const togglePin = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/chat/histories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pin' })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Pin failed')
      loadHistory()
    } catch (e) { showToast(e.message, 'error') }
  }, [apiFetch, loadHistory, showToast])

  return {
    // state
    messages,
    treeData,
    currentChatId,
    isWaiting,
    editingNodeId,
    chatHistory,
    chatLoading,
    sessionChecked,
    // actions
    setSessionChecked,
    setCurrentChatId,
    loadHistory,
    loadChat,
    sendMessage,
    deleteChat,
    newChat,
    startEdit,
    cancelEdit,
    renameChat,
    togglePin,
    // refs
    abortRef,
  }
}
