import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'

export default function Chats() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [chats, setChats] = useState([])
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, hasPrev: false, hasNext: false })
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const page = parseInt(searchParams.get('page')) || 1
  const username = searchParams.get('username') || ''
  const status = searchParams.get('status') || ''

  useEffect(() => {
    async function fetchChats() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('page', page)
        if (username) params.set('username', username)
        if (status) params.set('status', status)
        const res = await fetch(`/api/admin/chats?${params}`)
        const data = await res.json()
        setChats(data.chats)
        setPagination(data.pagination)
      } catch (e) {
        console.error('Chats fetch error:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchChats()
  }, [page, username, status])

  const handleFilter = (e) => {
    e.preventDefault()
    const form = new FormData(e.target)
    const params = {}
    const u = form.get('username')
    const s = form.get('status')
    if (u) params.username = u
    if (s) params.status = s
    params.page = '1'
    setSearchParams(params)
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === chats.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(chats.map(c => c.id)))
    }
  }

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} selected chats?`)) return
    try {
      const res = await fetch('/api/admin/chats/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds] })
      })
      const data = await res.json()
      if (res.ok) {
        setChats(prev => prev.filter(c => !selectedIds.has(c.id)))
        setSelectedIds(new Set())
      } else {
        alert(data.message || 'Failed')
      }
    } catch (e) {
      console.error('Bulk delete error:', e)
    }
  }

  return (
    <>
      <h2 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <i className="fas fa-comments" style={{ color: '#666' }}></i> CHAT_LOGS
      </h2>

      <form className="admin-toolbar" onSubmit={handleFilter}>
        <input type="text" name="username" className="admin-search-input" placeholder="Filter by username..." defaultValue={username} />
        <select name="status" className="form-control" style={{ width: 'auto', minWidth: 150 }} defaultValue={status}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="deleted">Deleted</option>
        </select>
        <button type="submit" className="admin-btn admin-btn-primary">
          <i className="fas fa-filter"></i> Filter
        </button>
        {(username || status) && (
          <button type="button" className="admin-btn" onClick={() => setSearchParams({})}>
            <i className="fas fa-times"></i> Clear
          </button>
        )}
        {selectedIds.size > 0 && (
          <button type="button" className="admin-btn admin-btn-danger" onClick={bulkDelete}>
            <i className="fas fa-trash"></i> Delete ({selectedIds.size})
          </button>
        )}
      </form>

      {loading ? (
        <div style={{ color: '#666', padding: 20 }}>LOADING...</div>
      ) : (
        <>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" onChange={toggleAll} checked={chats.length > 0 && selectedIds.size === chats.length} />
                  </th>
                  <th>User</th>
                  <th>Created</th>
                  <th>Messages</th>
                  <th>Status</th>
                  <th>ID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {chats.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                      No chats found.
                    </td>
                  </tr>
                ) : (
                  chats.map(chat => (
                    <tr key={chat.id} className={chat.is_deleted ? 'row-deleted' : ''}>
                      <td>
                        <input type="checkbox" checked={selectedIds.has(chat.id)} onChange={() => toggleSelect(chat.id)} />
                      </td>
                      <td><strong>{chat.username}</strong></td>
                      <td style={{ color: '#666' }}>{chat.created_at}</td>
                      <td>{chat.message_count}</td>
                      <td>
                        {chat.is_deleted
                          ? <span className="badge badge-deleted">DELETED</span>
                          : <span className="badge badge-active">ACTIVE</span>
                        }
                      </td>
                      <td style={{ fontFamily: 'monospace', color: '#666', fontSize: '0.85rem' }}>{chat.id}</td>
                      <td>
                        <Link to={`/admin/chat-detail/${chat.id}`} className="admin-btn" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>
                          <i className="fas fa-eye"></i> View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <span className="page-info">Page {pagination.currentPage} of {pagination.totalPages}</span>
            <div className="page-controls">
              <button className="admin-btn" disabled={!pagination.hasPrev}
                onClick={() => {
                  const p = { page: String(page - 1) }
                  if (username) p.username = username
                  if (status) p.status = status
                  setSearchParams(p)
                }}>
                <i className="fas fa-chevron-left"></i> Previous
              </button>
              <button className="admin-btn" disabled={!pagination.hasNext}
                onClick={() => {
                  const p = { page: String(page + 1) }
                  if (username) p.username = username
                  if (status) p.status = status
                  setSearchParams(p)
                }}>
                Next <i className="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
