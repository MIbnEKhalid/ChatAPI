"use client";

import { memo, useRef, useCallback, useEffect } from "react";

const ChatInput = memo(function ChatInput({
  inputValue,
  setInputValue,
  isWaiting,
  editingNodeId,
  onSend,
  onCancelEdit,
  inputRef,
  modelName,
}) {
  const localRef = useRef(null);
  const ref = inputRef || localRef;

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend]
  );

  const handleChange = useCallback(
    (e) => {
      setInputValue(e.target.value);
      e.target.style.height = "auto";
      e.target.style.height = Math.min(e.target.scrollHeight, 220) + "px";
    },
    [setInputValue]
  );

  useEffect(() => {
    if (editingNodeId) ref.current?.focus();
  }, [editingNodeId, ref]);

  const hasContent = inputValue.trim().length > 0;

  return (
    <div className="input-area">
      {/* Branching indicator */}
      {editingNodeId && (
        <div className="editing-overlay">
          <i className="fas fa-code-branch" style={{ color: "var(--accent)" }}></i>
          <span>Editing previous message — will create a new branching thread</span>
          <button type="button" className="btn-cancel-edit" onClick={onCancelEdit}>
            <i className="fas fa-times" style={{ marginRight: 4 }}></i>
            Cancel
          </button>
        </div>
      )}

      {/* Input wrapper */}
      <div className="input-wrapper" style={{ position: "relative" }}>
        <textarea
          ref={ref}
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything, write code, analyze data... (Shift+Enter for newline)"
          rows={1}
          disabled={isWaiting}
          className="chat-textarea"
        />

        <div className="input-actions">
          <button
            type="button"
            className="btn-send"
            onClick={onSend}
            disabled={!hasContent || isWaiting}
            title={isWaiting ? "Generating response..." : "Send message (Enter)"}
            style={{
              boxShadow: hasContent && !isWaiting ? "0 2px 10px rgba(99, 102, 241, 0.4)" : "none",
            }}
          >
            {isWaiting ? (
              <i className="fas fa-circle-notch fa-spin" style={{ fontSize: "0.95rem" }}></i>
            ) : (
              <i className="fas fa-arrow-up" style={{ fontSize: "0.95rem" }}></i>
            )}
          </button>
        </div>
      </div>

      {/* Input footer disclaimer and shortcuts */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 800, margin: "8px auto 0", padding: "0 4px", fontSize: "0.72rem", color: "var(--text-muted)" }}>
        <span>
          <i className="fas fa-sparkles" style={{ marginRight: 4, color: "var(--accent)" }}></i>
          Powered by Gemini & DeepSeek
        </span>
        <span>
          Use <kbd style={{ padding: "1px 5px", background: "var(--bg-sidebar)", borderRadius: 3, border: "1px solid var(--border-light)" }}>Shift + Enter</kbd> for newline
        </span>
      </div>
    </div>
  );
});

export default ChatInput;
