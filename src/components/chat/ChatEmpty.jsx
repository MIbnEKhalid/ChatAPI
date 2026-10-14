"use client";

import { memo } from "react";

const PROMPT_CARDS = [
  {
    icon: "fa-code",
    color: "#6366f1",
    bg: "rgba(99, 102, 241, 0.12)",
    title: "Code Architecture",
    desc: "Architect a resilient event streaming pipeline using Next.js & PostgreSQL",
    prompt: "How can I architect a resilient real-time event streaming pipeline using Next.js App Router and PostgreSQL?",
  },
  {
    icon: "fa-brain",
    color: "#a855f7",
    bg: "rgba(168, 85, 247, 0.12)",
    title: "System Reasoning",
    desc: "Compare concurrency trade-offs between PostgreSQL row-locks and SQLite WAL",
    prompt: "Compare the concurrency and locking trade-offs between PostgreSQL SELECT FOR UPDATE and SQLite WAL mode in a serverless environment.",
  },
  {
    icon: "fa-bolt",
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    title: "Performance & Refactor",
    desc: "Optimize high-frequency database read queries with caching strategies",
    prompt: "What are the best strategies to optimize and cache high-frequency read queries in a full-stack Next.js web application?",
  },
  {
    icon: "fa-shield-halved",
    color: "#22c55e",
    bg: "rgba(34, 197, 94, 0.12)",
    title: "Security & Encryption",
    desc: "Implement AES-256-GCM authenticated encryption for sensitive user API keys",
    prompt: "Show me an implementation of AES-256-GCM encryption in Node.js for securely storing user API keys with initialization vectors and auth tags.",
  },
];

const ChatEmpty = memo(function ChatEmpty({ username, onSuggestion }) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="chat-welcome">
      <div className="welcome-logo-badge">
        <i className="fas fa-sparkles"></i>
      </div>

      <h1 className="welcome-title">
        {getGreeting()}{username ? `, ${username}` : ""}
      </h1>
      <p className="welcome-sub">
        Explore complex ideas, architect resilient code, and converse with high-reasoning Gemini & DeepSeek models.
      </p>

      <div className="welcome-cards-grid">
        {PROMPT_CARDS.map((card, i) => (
          <div
            key={i}
            className="welcome-card"
            onClick={() => onSuggestion?.(card.prompt)}
            role="button"
            tabIndex={0}
          >
            <div className="welcome-card-icon" style={{ background: card.bg, color: card.color }}>
              <i className={`fas ${card.icon}`}></i>
            </div>
            <div className="welcome-card-content">
              <div className="welcome-card-title">
                <span>{card.title}</span>
                <i className="fas fa-arrow-right welcome-card-arrow"></i>
              </div>
              <p className="welcome-card-desc">{card.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="welcome-features-strip">
        <div className="welcome-feature-item">
          <i className="fas fa-network-wired"></i>
          <span>Tree-Branching Memory</span>
        </div>
        <div className="welcome-feature-item">
          <i className="fas fa-lock"></i>
          <span>AES-256 Encrypted Vault</span>
        </div>
        <div className="welcome-feature-item">
          <i className="fas fa-bolt"></i>
          <span>Gemini 2.5 & DeepSeek V4</span>
        </div>
      </div>
    </div>
  );
});

export default ChatEmpty;
