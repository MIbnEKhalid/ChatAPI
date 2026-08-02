import { memo, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

const ChatMessage = memo(function ChatMessage({ msg, onStartEdit, showToast }) {
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.content)
    showToast?.('Copied to clipboard', 'success')
  }, [msg.content, showToast])

  const isUser = msg.role === 'user'

  return (
    <div className={`msg-row ${isUser ? 'msg-row--user' : 'msg-row--ai'}`}>
      {!isUser && (
        <div className="msg-avatar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/>
            <path d="M8 15c0 0 1.5 2 4 2s4-2 4-2"/>
          </svg>
        </div>
      )}
      {/* Wrap bubble + actions vertically for user messages */}
      <div className={isUser ? 'msg-user-col' : undefined}>
        <div className={`msg-bubble ${isUser ? 'msg-bubble--user' : 'msg-bubble--ai'}`}>
          <div className="msg-text">
            {isUser ? (
              msg.content
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {msg.content}
              </ReactMarkdown>
            )}
          </div>
          {/* AI actions stay inside bubble */}
          {!isUser && (
            <div className="msg-actions-row">
              <button className="msg-action" onClick={handleCopy} title="Copy">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
            </div>
          )}
        </div>
        {/* User actions directly below bubble */}
        {isUser && (
          <div className="msg-actions-row msg-actions-row--below">
            <button className="msg-action" onClick={() => onStartEdit?.(msg.id)} title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button className="msg-action" onClick={handleCopy} title="Copy">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </div>
        )}
      </div>
      {isUser && <div className="msg-spacer" />}
    </div>
  )
})

export default ChatMessage
