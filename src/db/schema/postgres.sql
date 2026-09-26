-- First The DB should have PrereQuisite SQL Query 
-- for mbkauthe from mbkauthe/docs/schema/.

-- =========================================================
-- SAFE INITIALIZATION SCRIPT (Runs on every startup)
-- =========================================================
-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Chat History Table (Only if missing)
CREATE TABLE IF NOT EXISTS chatapi_ai_history (
    id SERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    conversation_history JSONB NOT NULL,
    title VARCHAR(255),
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    username VARCHAR(50) NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Indexes (Safe creation)
CREATE INDEX IF NOT EXISTS idx_chat_username ON chatapi_ai_history(username);
CREATE INDEX IF NOT EXISTS idx_chat_deleted ON chatapi_ai_history(is_deleted);
CREATE INDEX IF NOT EXISTS idx_chat_pinned ON chatapi_ai_history(username, is_pinned);
CREATE INDEX IF NOT EXISTS idx_chat_history_gin ON chatapi_ai_history USING gin (conversation_history);

-- Safe column additions for existing tables
DO $$ BEGIN
  ALTER TABLE chatapi_ai_history ADD COLUMN IF NOT EXISTS title VARCHAR(255);
  ALTER TABLE chatapi_ai_history ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. Create User Message Logs (Only if missing)
CREATE TABLE IF NOT EXISTS chatapi_user_message_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    message_count INTEGER DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    CONSTRAINT unique_user_date UNIQUE (username, date)
);

CREATE INDEX IF NOT EXISTS idx_message_logs_lookup ON chatapi_user_message_logs(username, date);

-- 4. Triggers (PostgreSQL doesn't support "CREATE TRIGGER IF NOT EXISTS" easily, 
-- so we wrap it in a DO block to prevent errors)
CREATE OR REPLACE FUNCTION update_timestamp() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trigger_update_chat_timestamp'
    ) THEN
        CREATE TRIGGER trigger_update_chat_timestamp
        BEFORE UPDATE ON chatapi_ai_history
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS chatapi_user_api_keys (
    username VARCHAR(50) NOT NULL,
    provider TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, provider)
);

CREATE TABLE IF NOT EXISTS chatapi_user_settings (
    username VARCHAR(50) PRIMARY KEY,
    daily_message_limit INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
