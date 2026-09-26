-- First The DB should have PrereQuisite SQL Query 
-- for mbkauthe from mbkauthe/docs/schema/.


-- =============================================================================
-- ChatAPI SQLite Schema (with full mbkauthe support)
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- ChatAPI Domain Tables
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