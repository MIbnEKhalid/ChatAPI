"use client";

import { memo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

const ChatMessage = memo(function ChatMessage({ msg, onStartEdit, showToast }) {
  const [copiedCode, setCopiedCode] = useState(null);
  const isUser = msg.role === "user";

  const handleCopyMessage = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(msg.content);
      showToast?.("Copied message to clipboard", "success");
    }
  }, [msg.content, showToast]);

  const handleCopyCode = useCallback(
    (codeText) => {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(codeText);
        setCopiedCode(codeText);
        showToast?.("Code copied to clipboard", "success");
        setTimeout(() => setCopiedCode(null), 2000);
      }
    },
    [showToast]
  );

  return (
    <div className={`msg-row ${isUser ? "msg-row--user" : "msg-row--ai"}`}>
      {/* Avatar */}
      <div
        className="msg-avatar"
        style={{
          background: isUser
            ? "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)"
            : "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
          color: "#ffffff",
        }}
      >
        <i className={`fas ${isUser ? "fa-user" : "fa-sparkles"}`} style={{ fontSize: "0.82rem" }}></i>
      </div>

      {/* Bubble + Actions Column */}
      <div className={isUser ? "msg-user-col" : undefined} style={{ flex: 1, minWidth: 0 }}>
        <div className={`msg-bubble ${isUser ? "msg-bubble--user" : "msg-bubble--ai"}`}>
          <div className="msg-text">
            {isUser ? (
              msg.content
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = String(children).replace(/\n$/, "");

                    if (!inline && match) {
                      const isCopied = copiedCode === codeString;
                      return (
                        <div className="code-block-wrapper">
                          <div className="code-block-header">
                            <div className="code-block-dots">
                              <span className="dot red"></span>
                              <span className="dot yellow"></span>
                              <span className="dot green"></span>
                            </div>
                            <span className="code-block-lang">{match[1]}</span>
                            <button
                              type="button"
                              className="code-copy-btn"
                              onClick={() => handleCopyCode(codeString)}
                              title="Copy code"
                            >
                              <i className={`fas ${isCopied ? "fa-check" : "fa-copy"}`} style={{ color: isCopied ? "#22c55e" : undefined }}></i>
                              <span>{isCopied ? "Copied!" : "Copy"}</span>
                            </button>
                          </div>
                          <pre className={className}>
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                        </div>
                      );
                    }

                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
            )}
          </div>

          {/* AI message actions */}
          {!isUser && (
            <div className="msg-actions-row">
              <button className="msg-action" onClick={handleCopyMessage} title="Copy response">
                <i className="fas fa-copy"></i>
                <span>Copy</span>
              </button>
            </div>
          )}
        </div>

        {/* User message actions below bubble */}
        {isUser && (
          <div className="msg-actions-row msg-actions-row--below">
            <button
              className="msg-action"
              onClick={() => onStartEdit?.(msg.id)}
              title="Edit prompt & create branch"
            >
              <i className="fas fa-pen-to-square"></i>
              <span>Branch</span>
            </button>
            <button className="msg-action" onClick={handleCopyMessage} title="Copy prompt">
              <i className="fas fa-copy"></i>
              <span>Copy</span>
            </button>
          </div>
        )}
      </div>

      {isUser && <div className="msg-spacer" />}
    </div>
  );
});

export default ChatMessage;
