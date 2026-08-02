import { useState } from 'react'

const TABS = [
  { id: 'general', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z', label: 'General' },
  { id: 'model', icon: 'M12 2a4 4 0 014 4v2h2a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8a2 2 0 012-2h2V6a4 4 0 014-4zm0 2a2 2 0 00-2 2v2h4V6a2 2 0 00-2-2z', label: 'Model' },
  { id: 'appearance', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18a8 8 0 110-16 8 8 0 010 16z M12 6a6 6 0 100 12 6 6 0 000-12z', label: 'Appearance' },
  { id: 'account', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z', label: 'Account' },
]

function SvgIcon({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d.split(' M').map((p, i) => <path key={i} d={(i > 0 ? 'M' : '') + p.trim()} />)}
    </svg>
  )
}

export default function SettingsModal({ settings, updateSettings, showToast, isOpen, onClose, children }) {
  const [activeTab, setActiveTab] = useState('general')

  if (!isOpen) return null

  const sideTabs = TABS.filter(t => t.id !== 'account')
  const tab = TABS.find(t => t.id === activeTab)

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="settings-panel">
        {/* Sidebar nav */}
        <div className="settings-sidebar">
          <div className="settings-sidebar-header">
            <h2>Settings</h2>
          </div>
          <nav className="settings-nav-list">
            {sideTabs.map(t => (
              <button key={t.id} className={`settings-nav-item ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                <SvgIcon d={t.icon} size={18} />
                <span>{t.label}</span>
              </button>
            ))}
            <div className="settings-nav-divider" />
            <button className={`settings-nav-item ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
              <SvgIcon d={TABS.find(t => t.id === 'account').icon} size={18} />
              <span>Account</span>
            </button>
          </nav>
          <div className="settings-sidebar-footer">
            <p className="settings-version">MBK ChatAPI v1.0</p>
          </div>
        </div>

        {/* Content */}
        <div className="settings-content">
          <div className="settings-content-header">
            <h3>{tab?.label}</h3>
            <button className="btn-modal-close" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="settings-content-body">
            {activeTab === 'general' && (
              <div className="settings-section">
                <div className="setting-row">
                  <div className="setting-info">
                    <label>Temperature</label>
                    <p>Controls randomness: lower = more focused, higher = more creative</p>
                  </div>
                  <div className="setting-control">
                    <span className="temp-value">{settings.temperature.toFixed(2)}</span>
                    <input type="range" min="0" max="200" value={settings.temperature * 100} onChange={e => updateSettings({ temperature: e.target.value / 100 })} />
                    <div className="range-labels"><span>Precise</span><span>Creative</span></div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'model' && (
              <div className="settings-section">
                <div className="setting-row">
                  <div className="setting-info">
                    <label>AI Model</label>
                    <p>Select which model powers your conversations</p>
                  </div>
                  <div className="setting-control">
                    <select className="form-control" value={settings.model} onChange={e => updateSettings({ model: e.target.value })}>
                      <optgroup label="DeepSeek">
                        <option value="deepseek/deepseek-v4-flash">DeepSeek V4 Flash</option>
                        <option value="deepseek/deepseek-v4-pro">DeepSeek V4 Pro</option>
                      </optgroup>
                    </select>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'appearance' && (
              <div className="settings-section">
                <div className="setting-row">
                  <div className="setting-info">
                    <label>Theme</label>
                    <p>Switch between light and dark mode</p>
                  </div>
                  <div className="setting-control">
                    <select className="form-control" value={settings.colorScheme || 'light'} onChange={e => updateSettings({ colorScheme: e.target.value })}>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <label>Font Size</label>
                    <p>Adjust text size: {settings.fontSize}px</p>
                  </div>
                  <div className="setting-control">
                    <input type="range" min="12" max="20" value={settings.fontSize} onChange={e => updateSettings({ fontSize: parseInt(e.target.value) })} />
                    <div className="range-labels"><span>12px</span><span>20px</span></div>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <label>Matrix Background</label>
                    <p>Enable the animated rain effect</p>
                  </div>
                  <div className="setting-control">
                    <label className="toggle-switch">
                      <input type="checkbox" checked={settings.matrixEnabled} onChange={e => updateSettings({ matrixEnabled: e.target.checked })} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'account' && (
              <div className="settings-section">
                {children}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
