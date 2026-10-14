"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      const s = JSON.parse(localStorage.getItem("mbk_chat_settings") || "{}");
      s.colorScheme = nextDark ? "dark" : "light";
      localStorage.setItem("mbk_chat_settings", JSON.stringify(s));
    } catch {}
  };

  const getPageTitle = () => {
    if (pathname.startsWith("/admin/dashboard")) return { title: "Dashboard Overview", subtitle: "Real-time system telemetry and activity" };
    if (pathname.startsWith("/admin/users")) return { title: "User Directory", subtitle: "Manage accounts, quotas, and permissions" };
    if (pathname.startsWith("/admin/chat-detail")) return { title: "Chat Tree Inspector", subtitle: "Granular branching conversation viewer" };
    if (pathname.startsWith("/admin/chats")) return { title: "Chat Logs", subtitle: "Inspect historical conversations and audits" };
    return { title: "Admin Console", subtitle: "System administration" };
  };

  const pageInfo = getPageTitle();

  return (
    <div className="admin-shell">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(4px)",
            zIndex: 90,
          }}
        />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="admin-sidebar-header">
          <Link href="/admin/dashboard" className="admin-brand" onClick={() => setMobileOpen(false)}>
            <div className="admin-brand-icon">
              <i className="fas fa-bolt"></i>
            </div>
            <div className="admin-brand-text">
              <span className="admin-brand-title">
                ChatAPI <span className="admin-brand-badge">ADMIN</span>
              </span>
              <span className="admin-brand-subtitle">Console v2.6</span>
            </div>
          </Link>
        </div>

        <nav className="admin-nav-section">
          <div className="admin-nav-group-title">Analytics</div>
          <Link
            href="/admin/dashboard"
            onClick={() => setMobileOpen(false)}
            className={`admin-nav-link ${pathname === "/admin/dashboard" ? "active" : ""}`}
          >
            <i className="fas fa-chart-pie"></i>
            <span>Dashboard</span>
          </Link>

          <div className="admin-nav-group-title">Management</div>
          <Link
            href="/admin/users"
            onClick={() => setMobileOpen(false)}
            className={`admin-nav-link ${pathname.startsWith("/admin/users") ? "active" : ""}`}
          >
            <i className="fas fa-users-gear"></i>
            <span>Users & Quotas</span>
          </Link>
          <Link
            href="/admin/chats"
            onClick={() => setMobileOpen(false)}
            className={`admin-nav-link ${pathname.startsWith("/admin/chats") || pathname.startsWith("/admin/chat-detail") ? "active" : ""}`}
          >
            <i className="fas fa-database"></i>
            <span>Chat Logs</span>
          </Link>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-profile">
            <div className="admin-user-avatar">SA</div>
            <div className="admin-user-details">
              <div className="admin-user-name">Superadmin</div>
              <div className="admin-user-role">
                <span className="admin-user-role-dot"></span>
                System Administrator
              </div>
            </div>
          </div>

          <div className="admin-sidebar-actions">
            <button
              type="button"
              onClick={toggleTheme}
              className="admin-btn admin-btn-secondary admin-btn-sm"
              style={{ flex: 1 }}
              title="Toggle theme"
            >
              <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`}></i>
              <span>{isDark ? "Light" : "Dark"}</span>
            </button>
            <Link
              href="/chatbot"
              className="admin-btn admin-btn-primary admin-btn-sm"
              title="Return to Chat"
            >
              <i className="fas fa-arrow-right-from-bracket"></i>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="admin-main-wrapper">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="admin-mobile-toggle"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle Navigation"
            >
              <i className="fas fa-bars"></i>
            </button>

            <nav className="admin-breadcrumbs">
              <Link href="/admin/dashboard">Admin</Link>
              <i className="fas fa-chevron-right" style={{ fontSize: "0.65rem" }}></i>
              <span className="current">{pageInfo.title}</span>
            </nav>
          </div>

          <div className="admin-topbar-right">
            <Link href="/chatbot" className="admin-btn admin-btn-secondary admin-btn-sm">
              <i className="fas fa-comments"></i>
              <span>Open Chat App</span>
            </Link>
          </div>
        </header>

        <main className="admin-content">
          <div className="admin-container">{children}</div>
        </main>
      </div>
    </div>
  );
}
