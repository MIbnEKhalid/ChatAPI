import { Outlet, NavLink } from 'react-router-dom'

export default function AdminLayout() {
  return (
    <div className="admin-layout">
      <nav className="admin-sidebar">
        <div className="admin-brand">
          <i className="fas fa-terminal"></i> MBK_ADMIN
        </div>
        <NavLink to="/admin/dashboard" className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
          <i className="fas fa-chart-line"></i> Dashboard
        </NavLink>
        <NavLink to="/admin/users" className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
          <i className="fas fa-users"></i> Users
        </NavLink>
        <NavLink to="/admin/chats" className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
          <i className="fas fa-comments"></i> Chat Logs
        </NavLink>
        <div style={{ flex: 1 }}></div>
        <div style={{
          padding: '12px', borderTop: '1px solid #222', marginTop: 'auto',
          background: 'rgba(0, 255, 65, 0.02)', borderRadius: '4px',
          borderLeft: '3px solid var(--neon-green)'
        }}>
          <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
            <i className="fas fa-circle" style={{ color: '#00ff41', fontSize: '0.5rem', marginRight: '6px' }}></i>
            Active User
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <i className="fas fa-user-shield" style={{ color: '#00ff41', fontSize: '1.2rem' }}></i>
            <strong style={{ color: '#00ff41', fontSize: '0.9rem' }}>Admin</strong>
          </div>
          <div style={{ fontSize: '0.65rem', color: '#666' }}>Admin Access Level</div>
        </div>
        <a href="/admin" className="admin-nav-link" style={{ marginTop: '10px' }}>
          <i className="fas fa-sign-out-alt"></i> Exit Admin
        </a>
      </nav>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
