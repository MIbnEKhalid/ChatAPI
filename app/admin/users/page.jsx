"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function UsersContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    hasPrev: false,
    hasNext: false,
  });
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [loading, setLoading] = useState(true);

  const page = parseInt(searchParams.get("page") || "1", 10) || 1;

  useEffect(() => {
    async function fetchUsers() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        if (search) params.set("search", search);
        const res = await fetch(`/api/admin/users?${params}`);
        if (res.status === 401) {
          window.location.href = `/mbkauthe/login?redirect=${encodeURIComponent("/admin/users")}`;
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        setUsers(data.users || []);
        setPagination(
          data.pagination || { currentPage: 1, totalPages: 1, hasPrev: false, hasNext: false }
        );
      } catch (e) {
        console.error("Users fetch error:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, [page, search]);

  const handleSearch = (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    p.set("page", "1");
    router.push(`/admin/users?${p.toString()}`);
  };

  const updatePage = (newPage) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", String(newPage));
    router.push(`/admin/users?${p.toString()}`);
  };

  return (
    <>
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            <i className="fas fa-users-gear"></i>
            User Directory
          </h1>
          <p className="admin-page-subtitle">
            Manage registered participants, message activity, and conversation records.
          </p>
        </div>
      </div>

      {/* Main Panel */}
      <div className="admin-panel">
        {/* Search Toolbar */}
        <form className="admin-toolbar" onSubmit={handleSearch}>
          <div className="admin-toolbar-left">
            <div className="admin-search-input-wrap">
              <i className="fas fa-magnifying-glass admin-search-icon"></i>
              <input
                type="text"
                className="admin-input"
                placeholder="Search username..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="submit" className="admin-btn admin-btn-primary">
              <i className="fas fa-search"></i>
              <span>Filter</span>
            </button>
            {search && (
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => {
                  setSearch("");
                  router.push("/admin/users");
                }}
              >
                <i className="fas fa-xmark"></i>
                <span>Clear</span>
              </button>
            )}
          </div>
          <div className="admin-toolbar-right">
            <span className="admin-panel-badge">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
          </div>
        </form>

        {/* Table View */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "300px", gap: 14 }}>
            <i className="fas fa-circle-notch fa-spin" style={{ fontSize: "1.6rem", color: "var(--accent)" }}></i>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Loading user accounts...</span>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User Profile</th>
                  <th>Total Conversations</th>
                  <th>Last Active</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center", padding: "48px 20px" }}>
                      <i className="fas fa-user-slash" style={{ fontSize: "2rem", color: "var(--text-muted)", marginBottom: 12, display: "block" }}></i>
                      <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 4 }}>No Users Found</div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                        {search ? "No users match your query." : "No users currently registered."}
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map((u, idx) => {
                    const initial = (u.username || "U").slice(0, 2).toUpperCase();
                    return (
                      <tr key={idx}>
                        <td>
                          <div className="admin-user-cell">
                            <div className="admin-user-cell-avatar">{initial}</div>
                            <div className="admin-user-cell-meta">
                              <span className="admin-user-cell-name">{u.username}</span>
                              <span className="admin-user-cell-sub">Participant Account</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="admin-badge admin-badge-indigo">
                            <i className="fas fa-comments"></i>
                            {u.total_chats || 0} chats
                          </span>
                        </td>
                        <td style={{ fontSize: "0.84rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {u.last_active || "Unknown"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Link
                            href={`/admin/chats?username=${encodeURIComponent(u.username)}`}
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                          >
                            <i className="fas fa-list-check"></i>
                            <span>View Chats</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="admin-pagination">
          <div className="admin-pagination-info">
            Showing Page {pagination.currentPage} of {pagination.totalPages}
          </div>
          <div className="admin-pagination-controls">
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              disabled={!pagination.hasPrev}
              onClick={() => updatePage(pagination.currentPage - 1)}
            >
              <i className="fas fa-chevron-left"></i>
              <span>Previous</span>
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              disabled={!pagination.hasNext}
              onClick={() => updatePage(pagination.currentPage + 1)}
            >
              <span>Next</span>
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
        <i className="fas fa-circle-notch fa-spin" style={{ color: "var(--accent)", fontSize: "1.6rem" }}></i>
      </div>
    }>
      <UsersContent />
    </Suspense>
  );
}
