import { memo, useRef, useCallback, useEffect } from 'react'

const ChatInput = memo(function ChatInput({
  inputValue, setInputValue, isWaiting, editingNodeId,
  onSend, onCancelEdit, inputRef,
}) {
  const localRef = useRef(null)
  const ref = inputRef || localRef

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
  }, [onSend])

  const handleChange = useCallback((e) => {
    setInputValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }, [setInputValue])

  useEffect(() => { if (editingNodeId) ref.current?.focus() }, [editingNodeId, ref])

  return (
    <div className="input-area">
      {editingNodeId && (
        <div className="editing-overlay">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span>Editing — creates a new branch</span>
          <button className="btn-cancel-edit" onClick={onCancelEdit}>Cancel</button>
        </div>
      )}

      <div className="input-wrapper">
        <textarea ref={ref} value={inputValue} onChange={handleChange} onKeyDown={handleKeyDown}
          placeholder="Message..." rows={1} disabled={isWaiting} className="chat-textarea" />
        <div className="input-actions">
          <button className="btn-send" onClick={onSend} disabled={!inputValue.trim() || isWaiting} title="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
      <p className="input-disclaimer">MBK Chat can make mistakes. Verify important information.</p>
    </div>
  )
})

export default ChatInput
