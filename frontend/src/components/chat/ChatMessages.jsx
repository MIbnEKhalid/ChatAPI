import { memo } from 'react'
import ChatMessage from './ChatMessage.jsx'
import ChatEmpty from './ChatEmpty.jsx'
import ChatLoading from './ChatLoading.jsx'

const ChatMessages = memo(function ChatMessages({
  messages, isWaiting, chatLoading, username, onStartEdit, onSuggestion, showToast, messagesRef,
}) {
  if (chatLoading) {
    return <div className="messages-container" ref={messagesRef}><ChatLoading /></div>
  }

  return (
    <div className="messages-container" ref={messagesRef}>
      {messages.length === 0 && <ChatEmpty username={username} onSuggestion={onSuggestion} />}
      {messages.map(msg => (
        <ChatMessage key={msg.id} msg={msg} onStartEdit={onStartEdit} showToast={showToast} />
      ))}
      {/* Only show typing dots when waiting AND no AI message is being streamed yet */}
      {isWaiting && messages[messages.length - 1]?.role !== 'model' && (
        <div className="msg-row msg-row--ai">
          <div className="msg-avatar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M8 15c0 0 1.5 2 4 2s4-2 4-2"/>
            </svg>
          </div>
          <div className="msg-bubble msg-bubble--ai">
            <div className="typing-dots"><span></span><span></span><span></span></div>
          </div>
        </div>
      )}
    </div>
  )
})

export default ChatMessages
