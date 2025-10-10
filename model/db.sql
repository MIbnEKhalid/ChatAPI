CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS ai_history_chatapi (
    id SERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    conversation_history JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    temperature FLOAT DEFAULT 1.0,
    "UserName" VARCHAR(50) REFERENCES "Users"("UserName") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_history_chatapi_username ON ai_history_chatapi("UserName");
CREATE INDEX IF NOT EXISTS idx_ai_history_chatapi_id ON ai_history_chatapi(id);
CREATE INDEX IF NOT EXISTS idx_ai_history_chatapi_created_at ON ai_history_chatapi(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_history_chatapi_conversation_id ON ai_history_chatapi(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_history_chatapi_conversation_history ON ai_history_chatapi USING gin (conversation_history);

UPDATE ai_history_chatapi
SET updated_at = created_at
WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS user_settings_chatapi (
    id SERIAL PRIMARY KEY,
    "UserName" VARCHAR(50) REFERENCES "Users"("UserName") ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'dark',
    font_size INTEGER DEFAULT 16,
    ai_model VARCHAR(50) DEFAULT 'default',
    temperature FLOAT DEFAULT 1.0,
    daily_message_limit INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_settings_chatapi_username ON user_settings_chatapi("UserName");

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
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
        WHERE tgname = 'update_user_settings_chatapi_updated_at'
    ) THEN
        CREATE TRIGGER update_user_settings_chatapi_updated_at
        BEFORE UPDATE ON user_settings_chatapi
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS user_message_logs_chatapi (
    id SERIAL PRIMARY KEY,
    "UserName" VARCHAR(50) REFERENCES "Users"("UserName") ON DELETE CASCADE,
    message_count INTEGER DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    CONSTRAINT unique_user_date UNIQUE ("UserName", date)
);
CREATE INDEX IF NOT EXISTS idx_user_message_logs_chatapi_username_date ON user_message_logs_chatapi("UserName", date);