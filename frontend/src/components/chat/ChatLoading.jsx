import { memo } from 'react'

const ChatLoading = memo(function ChatLoading() {
  return (
    <div className="chat-loading-wrap">
      {[1, 2, 3].map(i => (
        <div key={i} className={`msg-row ${i % 2 === 0 ? 'msg-row--user' : 'msg-row--ai'}`}>
          {i % 2 !== 0 && <div className="msg-avatar msg-avatar--skeleton" />}
          <div className="msg-bubble msg-bubble--skeleton" style={{ width: i === 1 ? '60%' : i === 2 ? '35%' : '50%' }}>
            <div className="skeleton-line" style={{ width: '100%' }} />
            <div className="skeleton-line" style={{ width: '70%' }} />
            {i === 1 && <div className="skeleton-line" style={{ width: '40%' }} />}
          </div>
        </div>
      ))}
    </div>
  )
})

export default ChatLoading
