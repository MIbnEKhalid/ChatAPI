import { memo } from 'react'

const ChatEmpty = memo(function ChatEmpty({ username, onSuggestion }) {
  const suggestions = [
    'Explain quantum computing in simple terms',
    'Write a Python script to sort a list',
    'What are the best practices for React?',
    'Help me debug a JavaScript error',
  ]

  return (
    <div className="chat-welcome">
      <div className="welcome-logo">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="4"/>
          <circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/>
          <path d="M8 15c0 0 1.5 2 4 2s4-2 4-2"/>
        </svg>
      </div>
      <h2 className="welcome-title">{username ? `Hi, ${username}` : 'Welcome'}</h2>
      <p className="welcome-sub">How can I help you today?</p>
      <div className="welcome-suggestions">
        {suggestions.map((s, i) => (
          <button key={i} className="suggestion-chip" onClick={() => onSuggestion?.(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
})

export default ChatEmpty
