-- =============================================================================
-- ChatAPI SQLite Schema (with full mbkauthe support)
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- 1. mbkauthe Core Tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mbkcore_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    user_id TEXT,
    email TEXT,
    password_hash TEXT,
    role TEXT DEFAULT 'normaluser',
    full_name TEXT,
    avatar_url TEXT,
    image TEXT DEFAULT 'https://portal.mbktech.org/icon.svg',
    bio TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login TEXT,
    is_active INTEGER DEFAULT 1,
    is_blocked INTEGER DEFAULT 0,
    blocked_reason TEXT,
    have_mail_account INTEGER DEFAULT 0,
    two_fa_enabled INTEGER DEFAULT 0,
    allowed_apps TEXT DEFAULT '["all"]'
);

CREATE TABLE IF NOT EXISTS mbkcore_sessions (
    id TEXT PRIMARY KEY DEFAULT (
        lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
        substr(lower(hex(randomblob(2))), 2) || '-' ||
        substr('89ab', (abs(random()) % 4) + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
        lower(hex(randomblob(6)))
    ),
    username VARCHAR(50) NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    last_active TEXT DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    device_name TEXT,
    is_trusted INTEGER DEFAULT 0,
    meta TEXT,
    FOREIGN KEY (username) REFERENCES mbkcore_users(username) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mbkcore_sessions_username ON mbkcore_sessions(username);
CREATE INDEX IF NOT EXISTS idx_mbkcore_sessions_expires_at ON mbkcore_sessions(expires_at);

CREATE TABLE IF NOT EXISTS mbkcore_two_factor (
    username VARCHAR(50) PRIMARY KEY,
    is_enabled INTEGER DEFAULT 0 NOT NULL,
    two_fa_secret TEXT,
    secret TEXT,
    backup_codes TEXT,
    enabled_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (username) REFERENCES mbkcore_users(username) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mbkcore_trusted_devices (
    id TEXT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    device_identifier TEXT NOT NULL,
    device_name TEXT,
    ip_address TEXT,
    user_agent TEXT,
    trusted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    last_used TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (username) REFERENCES mbkcore_users(username) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mbkcore_trusted_devices_user ON mbkcore_trusted_devices(username);
CREATE INDEX IF NOT EXISTS idx_mbkcore_trusted_devices_lookup ON mbkcore_trusted_devices(username, device_identifier);

CREATE TABLE IF NOT EXISTS mbkcore_session (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expire TEXT NOT NULL,
    username VARCHAR(50) REFERENCES mbkcore_users(username) ON DELETE CASCADE,
    last_activity TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mbkcore_session_expire ON mbkcore_session(expire);

CREATE TABLE IF NOT EXISTS mbkcore_password_resets (
    token TEXT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    FOREIGN KEY (username) REFERENCES mbkcore_users(username) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mbkcore_api_tokens (
    token_id TEXT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    token_hash TEXT NOT NULL,
    token_name TEXT NOT NULL,
    allowed_domains TEXT,
    permissions TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT,
    is_active INTEGER DEFAULT 1,
    rate_limit_per_minute INTEGER DEFAULT 60,
    FOREIGN KEY (username) REFERENCES mbkcore_users(username) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mbkcore_api_token_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_name TEXT NOT NULL UNIQUE,
    allowed_domains TEXT,
    permissions TEXT,
    rate_limit_per_minute INTEGER DEFAULT 60,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mbkcore_cli_auth_sessions (
    session_id TEXT PRIMARY KEY,
    client_name TEXT,
    ip_address TEXT,
    user_agent TEXT,
    status TEXT DEFAULT 'pending',
    username VARCHAR(50),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    authorized_at TEXT,
    token_name TEXT,
    token_id TEXT,
    token_secret TEXT,
    permissions TEXT
);

CREATE TABLE IF NOT EXISTS mbkcore_user_github (
    github_id TEXT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    github_login TEXT,
    connected_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (username) REFERENCES mbkcore_users(username) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mbkcore_user_google (
    google_id TEXT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    google_email TEXT,
    connected_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (username) REFERENCES mbkcore_users(username) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 2. ChatAPI Domain Tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chatapi_ai_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(3))),2) || '-' || printf('%x', (abs(random()) % 4 + 8)) || substr(lower(hex(randomblob(3))),2) || '-' || lower(hex(randomblob(6)))),
    conversation_history TEXT NOT NULL,
    title TEXT,
    is_pinned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    username VARCHAR(50) NOT NULL,
    is_deleted INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_username ON chatapi_ai_history(username);
CREATE INDEX IF NOT EXISTS idx_chat_deleted ON chatapi_ai_history(is_deleted);
CREATE INDEX IF NOT EXISTS idx_chat_pinned ON chatapi_ai_history(username, is_pinned);

CREATE TABLE IF NOT EXISTS chatapi_user_message_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL,
    message_count INTEGER DEFAULT 0,
    date TEXT DEFAULT CURRENT_DATE,
    CONSTRAINT unique_user_date UNIQUE (username, date)
);

CREATE INDEX IF NOT EXISTS idx_message_logs_lookup ON chatapi_user_message_logs(username, date);

CREATE TABLE IF NOT EXISTS chatapi_user_api_keys (
    username VARCHAR(50) NOT NULL,
    provider TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, provider)
);

CREATE TABLE IF NOT EXISTS chatapi_user_settings (
    username VARCHAR(50) PRIMARY KEY,
    daily_message_limit INTEGER DEFAULT 100,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3. Default Seed Data
-- -----------------------------------------------------------------------------

-- Admin account (username: admin, password: admin123, role: superadmin)
INSERT OR IGNORE INTO mbkcore_users (
    id, username, email, password_hash, role, full_name, is_active, is_blocked, allowed_apps
) VALUES (
    1,
    'admin',
    'admin@mbktech.org',
    '922c9af02415198bc0683656663bc50312ab309da2568adceff673cd8bc97182a2b4fda1908d03db2511d0367c4ab310247b84671c3772018ff1c457c929ec2d',
    'superadmin',
    'Administrator',
    1,
    0,
    '["all"]'
);

-- Support account
INSERT OR IGNORE INTO mbkcore_users (
    id, username, email, password_hash, role, full_name, is_active, is_blocked, allowed_apps
) VALUES (
    2,
    'support',
    'support@mbktech.org',
    'b8b10c1c9006d8c30ab81c412463c65ff6dae3293d9bfbaf5fd8e275081d0947f000a828004e2fbd3a8f6ef5a35ae3eddd4c57b00ecab376b12e607a16a57459',
    'superadmin',
    'Support Team',
    1,
    0,
    '["all"]'
);
