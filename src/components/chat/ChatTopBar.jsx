"use client";

import { memo, useState, useRef, useEffect } from "react";
import Link from "next/link";

const MODELS = [
  {
    group: "Google Gemini",
    items: [
      {
        id: "google/gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        desc: "Ultra-fast response with high reasoning capability",
        tag: "Recommended",
        icon: "fa-bolt",
        color: "#3b82f6",
      },
      {
        id: "google/gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        desc: "Deep analytical intelligence for complex problems",
        tag: "Pro",
        icon: "fa-brain",
        color: "#8b5cf6",
      },
      {
        id: "google/gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        desc: "Balanced speed and efficiency for general queries",
        tag: "Fast",
        icon: "fa-sparkles",
        color: "#06b6d4",
      },
      {
        id: "google/gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        desc: "High-volume lightweight model",
        tag: "Classic",
        icon: "fa-feather",
        color: "#64748b",
      },
    ],
  },
  {
    group: "DeepSeek",
    items: [
      {
        id: "deepseek/deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        desc: "Optimized for programming, logic, and rapid completions",
        tag: "Coder",
        icon: "fa-code",
        color: "#10b981",
      },
      {
        id: "deepseek/deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        desc: "Advanced multi-step reasoning and mathematical precision",
        tag: "Deep Reasoning",
        icon: "fa-microchip",
        color: "#6366f1",
      },
    ],
  },
];

const ChatTopBar = memo(function ChatTopBar({
  modelName,
  sidebarCollapsed,
  onToggleSidebar,
  settings,
  updateSettings,
  userData,
  onNewChat,
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const popoverRef = useRef(null);

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
    updateSettings?.({ colorScheme: nextDark ? "dark" : "light" });
  };

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setPopoverOpen(false);
      }
    }
    if (popoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popoverOpen]);

  const activeModel =
    MODELS.flatMap((g) => g.items).find((m) => m.id === settings?.model) ||
    MODELS[0].items[0];

  const isAdmin = userData?.role === "superadmin" || userData?.role === "admin";
  const limits = userData?.limits;

  return (
    <div className="top-bar">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Toggle Sidebar */}
        <button
          className={`top-bar-toggle ${sidebarCollapsed ? "collapsed" : ""}`}
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
          title={sidebarCollapsed ? "Open sidebar (Ctrl+B)" : "Close sidebar (Ctrl+B)"}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
            {sidebarCollapsed ? <path d="M15 9l3 3-3 3" /> : <path d="M9 15l-3-3 3-3" />}
          </svg>
        </button>

        {/* Model Selector Popover */}
        <div className="model-selector-wrap" ref={popoverRef}>
          <button
            type="button"
            className="model-selector-btn"
            onClick={() => setPopoverOpen(!popoverOpen)}
            title="Switch AI model"
          >
            <div className="model-selector-dot" style={{ background: activeModel.color }}></div>
            <span>{activeModel.name}</span>
            <i className={`fas fa-chevron-down`} style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}></i>
          </button>

          {popoverOpen && (
            <div className="model-popover">
              {MODELS.map((group) => (
                <div key={group.group}>
                  <div className="model-group-title">{group.group}</div>
                  {group.items.map((item) => {
                    const isSelected = item.id === settings?.model;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`model-option-card ${isSelected ? "active" : ""}`}
                        onClick={() => {
                          updateSettings?.({ model: item.id });
                          setPopoverOpen(false);
                        }}
                      >
                        <div
                          className="model-option-icon"
                          style={{
                            background: `${item.color}18`,
                            color: item.color,
                          }}
                        >
                          <i className={`fas ${item.icon}`}></i>
                        </div>
                        <div className="model-option-info">
                          <div className="model-option-name">
                            <span>{item.name}</span>
                            {isSelected && (
                              <i className="fas fa-check" style={{ color: "var(--accent)", fontSize: "0.75rem" }}></i>
                            )}
                          </div>
                          <div className="model-option-desc">{item.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New Chat Button */}
        <button
          type="button"
          onClick={onNewChat}
          className="admin-btn admin-btn-ghost admin-btn-sm"
          title="Start fresh conversation"
        >
          <i className="fas fa-plus"></i>
          <span>New Chat</span>
        </button>
      </div>

      {/* Right Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Message Quota Pill */}
        {limits && limits.dailyLimit && (
          <div
            className="topbar-quota-pill"
            title={`${limits.messageCount} used of ${limits.dailyLimit} daily messages`}
          >
            <i className="fas fa-battery-half" style={{ color: "var(--accent)" }}></i>
            <span>
              {limits.messageCount} / {limits.dailyLimit}
            </span>
          </div>
        )}

        {/* Admin Console Link for Admins */}
        {isAdmin && (
          <Link href="/admin/dashboard" className="topbar-admin-btn" title="Open Admin Console">
            <i className="fas fa-shield-halved"></i>
            <span>Admin</span>
          </Link>
        )}

        {/* Dark/Light Mode Switcher */}
        <button
          type="button"
          onClick={toggleTheme}
          className="admin-btn admin-btn-ghost admin-btn-sm admin-btn-icon"
          title={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
          aria-label="Toggle Theme"
        >
          <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`}></i>
        </button>
      </div>
    </div>
  );
});

export default ChatTopBar;
