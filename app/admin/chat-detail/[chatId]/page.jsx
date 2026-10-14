"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function AdminChatDetailPage() {
  const params = useParams();
  const chatId = params?.chatId;

  const [chat, setChat] = useState(null);
  const [treeNodes, setTreeNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("timeline"); // "timeline" | "raw"
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    async function fetchDetail() {
      if (!chatId) return;
      try {
        const res = await fetch(`/api/admin/chat-detail/${chatId}`);
        if (res.status === 401) {
          window.location.href = `/mbkauthe/login?redirect=${encodeURIComponent(
            `/admin/chat-detail/${chatId}`
          )}`;
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        setChat(data.chat);
        if (data.treeData) {
          const nodes = Object.entries(data.treeData.nodes || {}).map(([id, node]) => ({
            id,
            ...node,
          }));
          // Sort chronologically if timestamp exists
          nodes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          setTreeNodes(nodes);
        }
      } catch (e) {
        console.error("Chat detail error:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [chatId]);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "400px", gap: 14 }}>
        <i className="fas fa-circle-notch fa-spin" style={{ fontSize: "1.8rem", color: "var(--accent)" }}></i>
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Loading chat tree inspector...</span>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="admin-panel" style={{ padding: "48px 24px", textAlign: "center" }}>
        <i className="fas fa-triangle-exclamation" style={{ fontSize: "2.4rem", color: "var(--danger)", marginBottom: 14 }}></i>
        <h2 style={{ fontSize: "1.2rem", color: "var(--text-primary)", marginBottom: 6 }}>Conversation Not Found</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.86rem", marginBottom: 20 }}>
          The requested chat log with ID #{chatId} could not be located in the system.
        </p>
        <Link href="/admin/chats" className="admin-btn admin-btn-secondary">
          <i className="fas fa-arrow-left"></i>
          <span>Return to Chat Logs</span>
        </Link>
      </div>
    );
  }

  const userInitial = (chat.username || "U").slice(0, 2).toUpperCase();

  return (
    <>
      {/* Header Bar */}
      <div className="admin-page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Link href="/admin/chats" className="admin-btn admin-btn-ghost admin-btn-sm" style={{ paddingLeft: 0 }}>
              <i className="fas fa-arrow-left"></i>
              <span>Back to Logs</span>
            </Link>
            <span style={{ color: "var(--border-default)" }}>/</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Thread #{chat.id}
            </span>
          </div>

          <h1 className="admin-page-title">
            <i className="fas fa-sitemap"></i>
            {chat.title || `Conversation #${chat.id}`}
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {chat.is_deleted ? (
            <span className="admin-badge admin-badge-rose">
              <i className="fas fa-trash-can"></i> Deleted
            </span>
          ) : (
            <span className="admin-badge admin-badge-emerald">
              <i className="fas fa-circle-check"></i> Active
            </span>
          )}

          <div style={{ display: "flex", background: "var(--bg-main)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: 2 }}>
            <button
              type="button"
              onClick={() => setActiveTab("timeline")}
              className={`admin-btn admin-btn-sm ${activeTab === "timeline" ? "admin-btn-primary" : "admin-btn-ghost"}`}
            >
              <i className="fas fa-timeline"></i>
              <span>Timeline ({treeNodes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("raw")}
              className={`admin-btn admin-btn-sm ${activeTab === "raw" ? "admin-btn-primary" : "admin-btn-ghost"}`}
            >
              <i className="fas fa-code"></i>
              <span>Raw JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overview Metadata Card */}
      <div className="admin-stat-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="admin-user-cell-avatar">{userInitial}</div>
            <div>
              <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
                {chat.username}
              </div>
              <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                Owner Account
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 }}>
                Created At
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500 }}>
                {new Date(chat.created_at).toLocaleString()}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 }}>
                Tree Nodes
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500 }}>
                {treeNodes.length} messages
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 }}>
                Pin Status
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500 }}>
                {chat.is_pinned ? "Pinned" : "Standard"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === "timeline" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {treeNodes.length === 0 ? (
            <div className="admin-panel" style={{ padding: "40px 20px", textAlign: "center" }}>
              <i className="fas fa-inbox" style={{ fontSize: "2rem", color: "var(--text-muted)", marginBottom: 10, display: "block" }}></i>
              <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>No Messages Recorded</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>This conversation history contains no node content.</div>
            </div>
          ) : (
            treeNodes.map((node, index) => {
              const isUser = node.role === "user";
              return (
                <div key={node.id || index} className="admin-inspector-node">
                  <div className="admin-inspector-node-header">
                    <div className="admin-inspector-node-role">
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: isUser ? "linear-gradient(135deg, #6366f1, #a855f7)" : "linear-gradient(135deg, #10b981, #059669)",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                        }}
                      >
                        <i className={`fas ${isUser ? "fa-user" : "fa-robot"}`}></i>
                      </div>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {isUser ? "User Message" : "AI Assistant"}
                      </span>
                      {node.model && (
                        <span className="admin-badge admin-badge-slate">
                          {node.model}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        node: {node.id?.slice(0, 8)}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(node.content || "", node.id)}
                        className="admin-btn admin-btn-ghost admin-btn-sm"
                        title="Copy message content"
                      >
                        <i className={`fas ${copiedId === node.id ? "fa-check text-success" : "fa-copy"}`}></i>
                        <span>{copiedId === node.id ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>

                  <div className="admin-inspector-node-content">
                    {node.content || <em style={{ color: "var(--text-muted)" }}>Empty payload</em>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Raw JSON Inspector */
        <div className="admin-panel">
          <div className="admin-panel-header">
            <div className="admin-panel-title">
              <i className="fas fa-code" style={{ color: "var(--accent)" }}></i>
              Raw Tree Data Payload
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(JSON.stringify({ chat, nodes: treeNodes }, null, 2), "raw_json")}
              className="admin-btn admin-btn-secondary admin-btn-sm"
            >
              <i className={`fas ${copiedId === "raw_json" ? "fa-check" : "fa-copy"}`}></i>
              <span>{copiedId === "raw_json" ? "Copied JSON" : "Copy JSON"}</span>
            </button>
          </div>

          <div style={{ padding: 20 }}>
            <pre
              style={{
                background: "var(--bg-root)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                padding: 16,
                fontSize: "0.82rem",
                fontFamily: "var(--font-mono)",
                color: "var(--text-primary)",
                overflowX: "auto",
                maxHeight: "550px",
              }}
            >
              {JSON.stringify({ chat, nodes: treeNodes }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
