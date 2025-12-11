-- =========================================================
-- SAFE INITIALIZATION SCRIPT (Runs on every startup)
-- =========================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Chat History Table (Only if missing)
CREATE TABLE IF NOT EXISTS ai_history_chatapi (
    id SERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    conversation_history JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    username VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Indexes (Safe creation)
CREATE INDEX IF NOT EXISTS idx_chat_username ON ai_history_chatapi(username);
CREATE INDEX IF NOT EXISTS idx_chat_deleted ON ai_history_chatapi(is_deleted);
CREATE INDEX IF NOT EXISTS idx_chat_history_gin ON ai_history_chatapi USING gin (conversation_history);

-- 3. Create User Message Logs (Only if missing)
CREATE TABLE IF NOT EXISTS user_message_logs_chatapi (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    message_count INTEGER DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    CONSTRAINT unique_user_date UNIQUE (username, date)
);

CREATE INDEX IF NOT EXISTS idx_message_logs_lookup ON user_message_logs_chatapi(username, date);

-- 4. Triggers (PostgreSQL doesn't support "CREATE TRIGGER IF NOT EXISTS" easily, 
-- so we wrap it in a DO block to prevent errors)
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_chat_timestamp') THEN
        CREATE TRIGGER trigger_update_chat_timestamp
        BEFORE UPDATE ON ai_history_chatapi
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp();
    END IF;
END;
$$;