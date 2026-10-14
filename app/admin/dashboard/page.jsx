"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ total_chats: 0, unique_users: 0, deleted_chats: 0 });
  const [recentChats, setRecentChats] = useState([]);
  const [hourlyData, setHourlyData] = useState(Array(24).fill(0));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const statsRes = await fetch("/api/admin/stats");
      if (statsRes.status === 401) {
        window.location.href = `/mbkauthe/login?redirect=${encodeURIComponent("/admin/dashboard")}`;
        return;
      }
      if (!statsRes.ok) return;
      const statsData = await statsRes.json();
      setStats(statsData.stats || { total_chats: 0, unique_users: 0, deleted_chats: 0 });
      setRecentChats(statsData.recentChats || []);
      setHourlyData(statsData.hourlyData || Array(24).fill(0));
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const maxHourly = Math.max(...hourlyData, 1);
  const total24hRequests = hourlyData.reduce((acc, curr) => acc + curr, 0);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "400px", gap: 14 }}>
        <i className="fas fa-circle-notch fa-spin" style={{ fontSize: "1.8rem", color: "var(--accent)" }}></i>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", letterSpacing: "0.5px" }}>
          Aggregating telemetry...
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            <i className="fas fa-chart-line"></i>
            System Overview
          </h1>
          <p className="admin-page-subtitle">
            Real-time analytics, user engagement, and traffic telemetry.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchData}
          disabled={refreshing}
          className="admin-btn admin-btn-secondary"
        >
          <i className={`fas fa-rotate-right ${refreshing ? "fa-spin" : ""}`}></i>
          <span>{refreshing ? "Refreshing..." : "Refresh Data"}</span>
        </button>
      </div>

      {/* 4 Stat Cards */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <div className="admin-stat-icon-wrap admin-stat-icon-indigo">
              <i className="fas fa-comments"></i>
            </div>
            <span className="admin-stat-badge admin-stat-badge-positive">
              <i className="fas fa-arrow-trend-up"></i> Active
            </span>
          </div>
          <div className="admin-stat-body">
            <div className="admin-stat-value">{stats.total_chats?.toLocaleString() || 0}</div>
            <div className="admin-stat-label">Total Conversations</div>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <div className="admin-stat-icon-wrap admin-stat-icon-emerald">
              <i className="fas fa-users"></i>
            </div>
            <span className="admin-stat-badge admin-stat-badge-positive">
              Verified
            </span>
          </div>
          <div className="admin-stat-body">
            <div className="admin-stat-value">{stats.unique_users?.toLocaleString() || 0}</div>
            <div className="admin-stat-label">Unique Participants</div>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <div className="admin-stat-icon-wrap admin-stat-icon-amber">
              <i className="fas fa-bolt"></i>
            </div>
            <span className="admin-stat-badge admin-stat-badge-neutral">
              Peak / hr
            </span>
          </div>
          <div className="admin-stat-body">
            <div className="admin-stat-value">{maxHourly.toLocaleString()}</div>
            <div className="admin-stat-label">Peak Hourly Load</div>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-card-header">
            <div className="admin-stat-icon-wrap admin-stat-icon-rose">
              <i className="fas fa-trash-can"></i>
            </div>
            <span className="admin-stat-badge admin-stat-badge-neutral">
              Archived
            </span>
          </div>
          <div className="admin-stat-body">
            <div className="admin-stat-value">{stats.deleted_chats?.toLocaleString() || 0}</div>
            <div className="admin-stat-label">Purged / Soft-deleted</div>
          </div>
        </div>
      </div>

      {/* 24-Hour Activity Chart */}
      <div className="admin-panel">
        <div className="admin-panel-header">
          <div className="admin-panel-title-wrap">
            <div className="admin-panel-title">
              <i className="fas fa-chart-column" style={{ color: "var(--accent)" }}></i>
              24-Hour Request Volume
            </div>
            <span className="admin-panel-badge">{total24hRequests} requests</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.78rem", color: "var(--text-muted)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }}></span>
              UTC Timeline
            </span>
          </div>
        </div>

        <div className="admin-chart-box">
          <div className="admin-chart-bars-container">
            {hourlyData.map((count, i) => {
              const heightPct = Math.max((count / maxHourly) * 100, 3);
              const hourFormatted = String(i).padStart(2, "0") + ":00";
              return (
                <div className="admin-chart-col" key={i}>
                  <div className="admin-chart-tooltip">
                    {hourFormatted} UTC — {count} reqs
                  </div>
                  <div
                    className="admin-chart-bar-fill"
                    style={{ height: `${heightPct}%` }}
                  ></div>
                  <div className="admin-chart-hour-label">{i}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="admin-panel">
        <div className="admin-panel-header">
          <div className="admin-panel-title-wrap">
            <div className="admin-panel-title">
              <i className="fas fa-clock-rotate-left" style={{ color: "var(--accent)" }}></i>
              Recent Activity
            </div>
            <span className="admin-panel-badge">Last 10 sessions</span>
          </div>

          <Link href="/admin/chats" className="admin-btn admin-btn-ghost admin-btn-sm">
            <span>View All Logs</span>
            <i className="fas fa-arrow-right"></i>
          </Link>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Conversation</th>
                <th>Messages</th>
                <th>Status</th>
                <th>Timestamp</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentChats.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "48px 20px" }}>
                    <i className="fas fa-inbox" style={{ fontSize: "2rem", color: "var(--text-muted)", marginBottom: 12, display: "block" }}></i>
                    <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 4 }}>No Recent Chats</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>New conversations will appear here automatically.</div>
                  </td>
                </tr>
              ) : (
                recentChats.map((chat) => {
                  const initial = (chat.username || "U").slice(0, 2).toUpperCase();
                  return (
                    <tr key={chat.id}>
                      <td>
                        <div className="admin-user-cell">
                          <div className="admin-user-cell-avatar">{initial}</div>
                          <div className="admin-user-cell-meta">
                            <span className="admin-user-cell-name">{chat.username}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 320 }}>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {chat.title || "Untitled Session"}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                            ID #{chat.id}
                          </span>
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
      </div>
    </>
  );
}
