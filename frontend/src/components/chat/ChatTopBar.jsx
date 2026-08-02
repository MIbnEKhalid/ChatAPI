import { memo } from 'react'

const ChatTopBar = memo(function ChatTopBar({ modelName, sidebarCollapsed, onToggleSidebar, settings, updateSettings }) {
  return (
    <div className="top-bar">
      <button
        className={`top-bar-toggle ${sidebarCollapsed ? 'collapsed' : ''}`}
        onClick={onToggleSidebar}
        aria-label={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
        title={sidebarCollapsed ? 'Open sidebar (Ctrl+B)' : 'Close sidebar (Ctrl+B)'}
      >
        {sidebarCollapsed ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M9 3v18"/>
            <path d="M15 9l3 3-3 3"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M9 3v18"/>
            <path d="M9 15l-3-3 3-3"/>
          </svg>
        )}
      </button>

      <span className="top-bar-model">{modelName}</span>

      {settings && (
        <select
          className="top-bar-model-select"
          value={settings.model}
          onChange={e => updateSettings?.({ model: e.target.value })}
          title="Select AI model"
        >
          <option value="deepseek/deepseek-v4-flash">DeepSeek V4 Flash</option>
          <option value="deepseek/deepseek-v4-pro">DeepSeek V4 Pro</option>
        </select>
      )}
    </div>
  )
})

export default ChatTopBar
