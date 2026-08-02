import { useState, useEffect } from 'react'

export default function Dashboard() {
  const [stats, setStats] = useState({ total_chats: 0, unique_users: 0, deleted_chats: 0 })
  const [recentChats, setRecentChats] = useState([])
  const [hourlyData, setHourlyData] = useState(Array(24).fill(0))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/admin/dashboard')
        if (res.redirected) {
          window.location.href = res.url
          return
        }
        // Since admin routes return HTML, we need to fetch via API
        // For now fetch stats directly - we'll need API endpoints
        const statsRes = await fetch('/api/admin/stats')
        const statsData = await statsRes.json()
        setStats(statsData.stats)
        setRecentChats(statsData.recentChats)
        setHourlyData(statsData.hourlyData)
      } catch (e) {
        console.error('Dashboard fetch error:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) return <div style={{ padding: 30, color: '#666' }}>LOADING...</div>

  const maxHourly = Math.max(...hourlyData, 1)

  return (
    <>
      <h2 style={{ marginBottom: 30, display: 'flex', alignItems: 'center', gap: 10 }}>
        <i className="fas fa-tachometer-alt" style={{ color: '#666' }}></i> SYSTEM_OVERVIEW
      </h2>

      <div className="admin-grid">
        <div className="admin-card">
          <i className="fas fa-comments card-icon"></i>
          <div className="stat-label">Total Conversations</div>
          <div className="stat-value">{stats.total_chats}</div>
        </div>
        <div className="admin-card">
          <i className="fas fa-users card-icon"></i>
          <div className="stat-label">Unique Users</div>
          <div className="stat-value">{stats.unique_users}</div>
        </div>
        <div className="admin-card danger">
          <i className="fas fa-trash card-icon"></i>
          <div className="stat-label">Deleted Logs</div>
          <div className="stat-value" style={{ color: '#ff003c' }}>{stats.deleted_chats}</div>
        </div>
      </div>

      <div className="admin-chart-section">
        <div className="admin-chart-header">
          <div className="stat-label">Request Volume (24 Hours)</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>UTC Time</div>
        </div>
        <div className="admin-chart-box">
          {hourlyData.map((count, i) => (
            <div className="bar-group" key={i} title={`${i}:00 - ${count} requests`}>
              <div className="bar" style={{ height: `${(count / maxHourly) * 100}%` }}></div>
              <div className="bar-label">{i}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-table-container">
        <div className="admin-table-header">
          <i className="fas fa-history"></i> RECENT ACTIVITY (Last 10)
        </div>
        <div className="admin-table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Timestamp</th>
                <th>Msgs</th>
                <th>Status</th>
                <th>Reference ID</th>
              </tr>
            </thead>
            <tbody>
              {recentChats.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                    <i className="fas fa-inbox" style={{ fontSize: '2rem', marginBottom: 10, display: 'block' }}></i>
                    No recent activity found.
                  </td>
                </tr>
              ) : (
                recentChats.map(chat => (
                  <tr key={chat.id} className={chat.is_deleted ? 'row-deleted' : ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-user-circle" style={{ opacity: 0.5 }}></i>
                        <strong>{chat.username}</strong>
                      </div>
                    </td>
                    <td style={{ color: '#666', fontSize: '0.9rem' }}>{chat.created_at}</td>
                    <td>
                      <span style={{ background: '#222', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem', color: '#fff' }}>
                        {chat.message_count}
                      </span>
                    </td>
                    <td>
                      {chat.is_deleted
                        ? <span className="badge badge-deleted">DELETED</span>
                        : <span className="badge badge-active">ACTIVE</span>
                      }
                    </td>
                    <td style={{ fontFamily: 'monospace', color: '#666', fontSize: '0.85rem' }}>{chat.id}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
