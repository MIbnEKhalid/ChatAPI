```
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE Ai_history (
    id SERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    conversation_history JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    username TEXT
);
CREATE INDEX idx_ai_history_username ON Ai_history(username);
CREATE INDEX idx_ai_history_id ON Ai_history(id);
```