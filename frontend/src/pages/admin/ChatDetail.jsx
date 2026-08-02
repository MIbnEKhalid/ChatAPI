import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

export default function ChatDetail() {
  const { chatId } = useParams()
  const [chat, setChat] = useState(null)
  const [treeNodes, setTreeNodes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDetail() {
      try {
        const res = await fetch(`/api/admin/chat-detail/${chatId}`)
        const data = await res.json()
        setChat(data.chat)
        if (data.treeData) {
          const nodes = Object.entries(data.treeData.nodes || {}).map(([id, node]) => ({
            id,
            ...node
          }))
          setTreeNodes(nodes)
        }
      } catch (e) {
        console.error('Chat detail error:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchDetail()
  }, [chatId])

  if (loading) return <div style={{ color: '#666', padding: 20 }}>LOADING...</div>
  if (!chat) return <div style={{ color: '#ff003c', padding: 20 }}>Chat not found.</div>

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: 15, marginBottom: 20 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fas fa-sitemap" style={{ color: '#bc13fe' }}></i>
            CHAT TREE INSPECTOR
            {chat.is_deleted && <span className="badge badge-deleted" style={{ marginLeft: 10 }}>DELETED</span>}
          </h2>
          <div className="meta" style={{ fontSize: '0.9rem', color: '#666', display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
            <span>User: <span style={{ color: '#fff' }}>{chat.username}</span></span>
            <span>Created: <span style={{ color: '#fff' }}>{new Date(chat.created_at).toLocaleString()}</span></span>
            <span>Nodes: <span style={{ color: '#fff' }}>{treeNodes.length}</span></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/admin/chats" className="admin-btn">
            <i className="fas fa-arrow-left"></i> Back
          </Link>
        </div>
      </div>

      <div style={{ background: '#0a0a0a', border: '1px solid #333', borderRadius: 6, padding: 20 }}>
        <h3 style={{ color: '#00ff41', marginBottom: 20 }}>Conversation Tree Nodes ({treeNodes.length})</h3>
        {treeNodes.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>No nodes in tree.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {treeNodes.map(node => (
              <div key={node.id} style={{
                background: '#111', border: '1px solid #333', borderRadius: 6, padding: 15,
                borderLeft: node.role === 'user' ? '3px solid #bc13fe' : '3px solid #00ff41'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className={`badge ${node.role === 'user' ? 'badge-active' : ''}`}
                    style={node.role === 'model' ? { background: 'rgba(0,255,65,0.1)', color: '#00ff41', border: '1px solid rgba(0,255,65,0.3)' } : {}}>
                    {node.role.toUpperCase()}
                  </span>
                  <span style={{ color: '#666', fontSize: '0.75rem' }}>ID: {node.id}</span>
                </div>
                <div style={{ color: '#ccc', lineHeight: 1.6, maxHeight: 200, overflow: 'auto' }}>
                  {node.parts?.[0]?.text || '(empty)'}
                </div>
                {node.parentId && (
                  <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#888' }}>
                    Parent: {node.parentId} {node.parentId === 'root' ? '(ROOT)' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
