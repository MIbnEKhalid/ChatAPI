"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function ChatsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [chats, setChats] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    hasPrev: false,
    hasNext: false,
  });
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const page = parseInt(searchParams.get("page") || "1", 10) || 1;
  const username = searchParams.get("username") || "";
  const status = searchParams.get("status") || "";

  useEffect(() => {
    async function fetchChats() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        if (username) params.set("username", username);
        if (status) params.set("status", status);
        const res = await fetch(`/api/admin/chats?${params}`);
        if (res.status === 401) {
          window.location.href = `/mbkauthe/login?redirect=${encodeURIComponent("/admin/chats")}`;
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        setChats(data.chats || []);
        setPagination(
          data.pagination || { currentPage: 1, totalPages: 1, hasPrev: false, hasNext: false }
        );
      } catch (e) {
        console.error("Chats fetch error:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchChats();
  }, [page, username, status]);

  const handleFilter = (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const params = new URLSearchParams();
    const u = form.get("username");
    const s = form.get("status");
    if (u) params.set("username", u.toString());
    if (s) params.set("status", s.toString());
    params.set("page", "1");
    router.push(`/admin/chats?${params.toString()}`);
  };

  const updatePage = (newPage) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", String(newPage));
    router.push(`/admin/chats?${p.toString()}`);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === chats.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(chats.map((c) => c.id)));
    }
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected conversations?`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/chats/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const data = await res.json();
      if (res.ok) {
        setChats((prev) => prev.filter((c) => !selectedIds.has(c.id)));
        setSelectedIds(new Set());
      } else {
        alert(data.message || "Failed to delete selected chats");
      }
    } catch (err) {
      console.error(err);
      alert("Error occurred while deleting chats");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            <i className="fas fa-database"></i>
            Chat Logs & Audits
          </h1>
          <p className="admin-page-subtitle">
            Inspect conversation histories, monitor usage, and manage chat retention.
          </p>
        </div>
      </div>

      {/* Main Panel */}
      <div className="admin-panel">
        {/* Filters */}
        <form className="admin-toolbar" onSubmit={handleFilter}>
          <div className="admin-toolbar-left">
            <div className="admin-search-input-wrap">
              <i className="fas fa-user admin-search-icon"></i>
              <input
                type="text"
                name="username"
                className="admin-input"
                placeholder="Filter by username..."
                defaultValue={username}
              />
            </div>

            <select name="status" className="admin-select" defaultValue={status}>
              <option value="">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="deleted">Deleted Only</option>
            </select>

            <button type="submit" className="admin-btn admin-btn-primary">
              <i className="fas fa-filter"></i>
              <span>Apply</span>
            </button>

            {(username || status) && (
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => router.push("/admin/chats")}
              >
                <i className="fas fa-xmark"></i>
                <span>Reset</span>
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "340px", gap: 14 }}>
            <i className="fas fa-circle-notch fa-spin" style={{ fontSize: "1.6rem", color: "var(--accent)" }}></i>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Loading chat records...</span>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={chats.length > 0 && selectedIds.size === chats.length}
                      onChange={toggleAll}
                      style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                    />
                  </th>
                  <th>Conversation</th>
                  <th>Participant</th>
                  <th>Messages</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {chats.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: "center", padding: "48px 20px" }}>
                      <i className="fas fa-comments" style={{ fontSize: "2rem", color: "var(--text-muted)", marginBottom: 12, display: "block" }}></i>
                      <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 4 }}>No Chat Logs Found</div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                        {username || status ? "No logs match the current filters." : "No chats recorded in the database yet."}
                      </div>
                    </td>
                  </tr>
                ) : (
                  chats.map((chat) => {
                    const isSelected = selectedIds.has(chat.id);
                    const initial = (chat.username || "U").slice(0, 2).toUpperCase();
                    return (
                      <tr key={chat.id} style={{ background: isSelected ? "var(--accent-light)" : undefined }}>
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(chat.id)}
                            style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                          />
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 300 }}>
                            <span style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {chat.title || "Untitled Session"}
                            </span>
                            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                              ID #{chat.id}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="admin-user-cell">
                            <div className="admin-user-cell-avatar">{initial}</div>
                            <span className="admin-user-cell-name">{chat.username}</span>
                          </div>
                        </td>
                        <td>
                          <span className="admin-badge admin-badge-indigo">
                            <i className="fas fa-comment-dots"></i>
                            {chat.message_count || 1} msgs
                          </span>
                        </td>
                        <td>
                          {chat.is_deleted ? (
                            <span className="admin-badge admin-badge-rose">
                              <i className="fas fa-trash-can"></i> Deleted
                            </span>
                          ) : (
                            <span className="admin-badge admin-badge-emerald">
                              <i className="fas fa-circle-check"></i> Active
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {chat.created_at}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Link
                            href={`/admin/chat-detail/${chat.id}`}
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                          >
                            <i className="fas fa-sitemap"></i>
                            <span>Inspect</span>
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

      {/* Floating Selection Bar */}
      {selectedIds.size > 0 && (
        <div className="admin-bulk-bar">
          <div className="admin-bulk-count">
            <i className="fas fa-check-double" style={{ color: "var(--accent)" }}></i>
            <span>{selectedIds.size} chat{selectedIds.size > 1 ? "s" : ""} selected</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={bulkDelete}
              disabled={deleting}
              className="admin-btn admin-btn-danger admin-btn-sm"
            >
              <i className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-trash"}`}></i>
              <span>{deleting ? "Deleting..." : "Delete Selected"}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="admin-btn admin-btn-ghost admin-btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminChatsPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
        <i className="fas fa-circle-notch fa-spin" style={{ color: "var(--accent)", fontSize: "1.6rem" }}></i>
      </div>
    }>
      <ChatsContent />
    </Suspense>
  );
}
