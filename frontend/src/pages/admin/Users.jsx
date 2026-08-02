import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function Users() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [users, setUsers] = useState([])
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, hasPrev: false, hasNext: false })
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [loading, setLoading] = useState(true)

  const page = parseInt(searchParams.get('page')) || 1

  useEffect(() => {
    async function fetchUsers() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('page', page)
        if (search) params.set('search', search)
        const res = await fetch(`/api/admin/users?${params}`)
        const data = await res.json()
        setUsers(data.users)
        setPagination(data.pagination)
      } catch (e) {
        console.error('Users fetch error:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchUsers()
  }, [page, search])

  const handleSearch = (e) => {
    e.preventDefault()
    setSearchParams(search ? { search, page: '1' } : { page: '1' })
  }

  return (
    <>
      <h2 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <i className="fas fa-users-cog" style={{ color: '#666' }}></i> USER_DATABASE
      </h2>

      <form className="admin-toolbar" onSubmit={handleSearch}>
        <input
          type="text"
          className="admin-search-input"
          placeholder="Search users..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button type="submit" className="admin-btn admin-btn-primary">
          <i className="fas fa-search"></i> Search
        </button>
        {search && (
          <button type="button" className="admin-btn" onClick={() => { setSearch(''); setSearchParams({}) }}>
            <i className="fas fa-times"></i> Clear
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
                  <th>Username</th>
                  <th>Total Chats</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                      <i className="fas fa-user-slash" style={{ fontSize: '2rem', marginBottom: 10, display: 'block' }}></i>
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map(u => (
                    <tr key={u.username}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <i className="fas fa-user-circle" style={{ opacity: 0.5 }}></i>
                          <strong>{u.username}</strong>
                          <span className="badge badge-active" style={{ marginLeft: 8 }}>ACTIVE</span>
                        </div>
                      </td>
                      <td>{u.total_chats}</td>
                      <td style={{ color: '#666' }}>{u.last_active}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <span className="page-info">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            <div className="page-controls">
              <button
                className="admin-btn"
                disabled={!pagination.hasPrev}
                onClick={() => {
                  const p = { page: String(page - 1) }
                  if (search) p.search = search
                  setSearchParams(p)
                }}
              >
                <i className="fas fa-chevron-left"></i> Previous
              </button>
              <button
                className="admin-btn"
                disabled={!pagination.hasNext}
                onClick={() => {
                  const p = { page: String(page + 1) }
                  if (search) p.search = search
                  setSearchParams(p)
                }}
              >
                Next <i className="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
