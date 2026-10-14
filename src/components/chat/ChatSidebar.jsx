"use client";

import { memo, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ChatSidebar = memo(function ChatSidebar({
  sidebarRef,
  chatHistory,
  currentChatId,
  userData,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onTogglePin,
  onOpenSettings,
  onCloseSidebar,
  collapsed,
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef(null);

  const isAdmin = userData?.role === "superadmin" || userData?.role === "admin";

  // Flatten all chats, preserving order: pinned, today, yesterday, older
  const allChats = useMemo(() => {
    const groups = [
      { key: "pinned", label: "Pinned", icon: "fa-thumbtack" },
      { key: "today", label: "Today", icon: "fa-sun" },
      { key: "yesterday", label: "Yesterday", icon: "fa-calendar-day" },
      { key: "older", label: "Previous", icon: "fa-clock-rotate-left" },
    ];
    let merged = [];
    for (const { key, label, icon } of groups) {
      const items = chatHistory[key] || [];
      for (const c of items) merged.push({ ...c, group: label, groupIcon: icon });
    }
    if (!searchQuery.trim()) return merged;
    const q = searchQuery.toLowerCase();
    return merged.filter(
      (c) =>
        (c.title || "").toLowerCase().includes(q) ||
        (c.created_at || "").toLowerCase().includes(q)
    );
  }, [chatHistory, searchQuery]);

  const grouped = useMemo(() => {
    const map = {};
    for (const c of allChats) {
      if (!map[c.group]) map[c.group] = [];
      map[c.group].push(c);
    }
    return map;
  }, [allChats]);

  // Start inline rename
  const startRename = useCallback((e, chat) => {
    e.stopPropagation();
    setEditingId(chat.id);
    setEditValue(chat.title || chat.created_at || "");
    setTimeout(() => {
      editRef.current?.focus();
      editRef.current?.select();
    }, 20);
  }, []);

  // Submit rename
  const submitRename = useCallback(
    (chatId) => {
      const val = editValue.trim();
      if (val) {
        onRenameChat?.(chatId, val);
      }
      setEditingId(null);
      setEditValue("");
    },
    [editValue, onRenameChat]
  );

  // Cancel rename
  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditValue("");
  }, []);

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} ref={sidebarRef}>
      <div className="sidebar-header">
        <div className="sidebar-brand" onClick={onNewChat} title="Start New Chat">
          <img src="/icon.svg" alt="MBK" className="sidebar-logo" />
          <span>ChatAPI</span>
        </div>
        <button className="btn-sidebar-close" onClick={onCloseSidebar} aria-label="Close Sidebar">
          <i className="fas fa-xmark"></i>
        </button>
      </div>

      <div className="sidebar-new-chat-wrap">
        <button className="btn-new-chat" onClick={onNewChat} title="Start new conversation (Ctrl+N)">
          <i className="fas fa-plus"></i>
          <span>New Chat</span>
        </button>
      </div>

      {/* Admin Quick Link */}
      {isAdmin && (
        <div style={{ padding: "0 14px 8px" }}>
          <Link
            href="/admin/dashboard"
            className="admin-btn admin-btn-secondary"
            style={{ width: "100%", justifyContent: "flex-start", padding: "8px 12px", fontSize: "0.8rem", borderRadius: "var(--radius-md)" }}
          >
            <i className="fas fa-shield-halved" style={{ color: "var(--accent)" }}></i>
            <span style={{ fontWeight: 600 }}>Admin Console</span>
            <span className="admin-badge admin-badge-indigo" style={{ marginLeft: "auto", fontSize: "0.65rem", padding: "1px 6px" }}>
              HQ
            </span>
          </Link>
        </div>
      )}

      {/* Search */}
      <div className="sidebar-search">
        <i className="fas fa-search sidebar-search-icon"></i>
        <input
          type="text"
          className="sidebar-search-input"
          placeholder="Search history..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="sidebar-search-clear" onClick={() => setSearchQuery("")} title="Clear search">
            <i className="fas fa-times" style={{ fontSize: "0.75rem" }}></i>
          </button>
        )}
      </div>

      {/* Chat List */}
      <div className="chat-list">
        {allChats.length === 0 && (
          <div className="chat-list-empty">
            <i className="fas fa-message-slash" style={{ fontSize: "1.4rem", marginBottom: 8, display: "block", color: "var(--text-muted)" }}></i>
            <span>{searchQuery ? "No matching conversations" : "No conversations yet"}</span>
          </div>
        )}
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} className="chat-group">
            <div className="chat-group-title">
              <span>{group}</span>
              <span style={{ opacity: 0.6, fontSize: "0.65rem", marginLeft: 4 }}>({items.length})</span>
            </div>
            {items.map((chat) => {
              const isActive = String(chat.id) === String(currentChatId);
              const isEditing = editingId === chat.id;
              const displayTitle = chat.title || chat.created_at || "Untitled Thread";

              return (
                <div
                  key={chat.id}
                  className={`chat-item ${isActive ? "active" : ""} ${
                    chat.is_pinned ? "pinned" : ""
                  }`}
                  onClick={() => {
                    if (!isEditing) router.push(`/chatbot/${chat.id}`);
                  }}
                  title={displayTitle}
                >
                  {/* Pin indicator */}
                  {chat.is_pinned && (
                    <i className="fas fa-thumbtack chat-item-pin" style={{ fontSize: "0.65rem" }}></i>
                  )}

                  {/* Inline rename or display */}
                  {isEditing ? (
                    <input
                      ref={editRef}
                      className="chat-item-rename-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(chat.id);
                        if (e.key === "Escape") cancelRename();
                      }}
                      onBlur={() => submitRename(chat.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="chat-item-title">{displayTitle}</span>
                  )}

                  {/* Action buttons (appear on hover) */}
                  <div className="chat-item-actions">
                    {/* Pin toggle */}
                    <button
                      type="button"
                      className="chat-item-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin?.(chat.id);
                      }}
                      title={chat.is_pinned ? "Unpin thread" : "Pin thread"}
                    >
                      <i className={`fas fa-thumbtack ${chat.is_pinned ? "text-accent" : ""}`} style={{ fontSize: "0.72rem" }}></i>
                    </button>
                    {/* Rename */}
                    <button
                      type="button"
                      className="chat-item-action"
                      onClick={(e) => startRename(e, chat)}
                      title="Rename"
                    >
                      <i className="fas fa-pen" style={{ fontSize: "0.72rem" }}></i>
                    </button>
                    {/* Delete */}
                    <button
                      type="button"
                      className="chat-item-action chat-item-action--danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("Permanently delete this chat history?")) {
                          onDeleteChat(chat.id, e);
                        }
                      }}
                      title="Delete chat"
                    >
                      <i className="fas fa-trash-can" style={{ fontSize: "0.72rem" }}></i>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer User Profile */}
      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={onOpenSettings} title="Account & Preferences">
          <div className="user-avatar">
            {userData.username ? userData.username[0]?.toUpperCase() : "U"}
          </div>
          <div className="user-info">
            <div className="user-name">{userData.username || "Guest User"}</div>
            <div className="user-email-trunc">
              {userData.role ? userData.role.toUpperCase() : "PARTICIPANT"}
            </div>
          </div>
        </div>
        <button className="btn-settings" onClick={onOpenSettings} title="Open Settings">
          <i className="fas fa-gear" style={{ fontSize: "1rem" }}></i>
        </button>
      </div>
    </aside>
  );
});

export default ChatSidebar;
