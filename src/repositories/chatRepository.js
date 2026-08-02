import { pool } from "../config/database.js";
import {
  decryptKey,
  encryptKey,
  USER_KEY_STORAGE_ENABLED,
} from "../utils/crypto.js";

if (!USER_KEY_STORAGE_ENABLED) {
  console.warn(
    "API_KEY_ENCRYPTION_SECRET is not set. User-provided AI keys are disabled until the environment variable is configured."
  );
}

// Database operations for chat history and user API keys.
export const db = {
  // Fetch a single chat, optionally scoped to a username (ownership check).
  getChat: async (id, username = null) => {
    let query = "SELECT * FROM ai_history_chatapi WHERE id = $1 AND is_deleted = FALSE";
    const params = [id];
    if (username) {
      query += " AND username = $2";
      params.push(username);
    }
    const res = await pool.query(query, params);
    return res.rows[0];
  },

  // UPDATED: Removed Temperature Column, Updates Updated_at
  saveChat: async (id, treeData, username) => {
    const json = JSON.stringify(treeData);
    if (id) {
      await pool.query(
        "UPDATE ai_history_chatapi SET conversation_history = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [json, id]
      );
      return id;
    } else {
      const res = await pool.query(
        "INSERT INTO ai_history_chatapi (conversation_history, username) VALUES ($1, $2) RETURNING id",
        [json, username]
      );
      return res.rows[0].id;
    }
  },

  // Mock Limits (Connect to your real tables if needed)
  getLimits: async (username) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const [settings, logs] = await Promise.all([
        pool
          .query("SELECT daily_message_limit FROM user_settings_chatapi WHERE username = $1", [username])
          .catch(() => ({ rows: [] })),
        pool
          .query("SELECT message_count FROM user_message_logs_chatapi WHERE username = $1 AND date = $2", [
            username,
            today,
          ])
          .catch(() => ({ rows: [] })),
      ]);
      return {
        dailyLimit: settings.rows[0]?.daily_message_limit || 100,
        messageCount: logs.rows[0]?.message_count || 0,
      };
    } catch (e) {
      return { dailyLimit: 100, messageCount: 0 };
    }
  },

  initUserApiKeyStore: async () => {
    if (!USER_KEY_STORAGE_ENABLED) return;
    await pool.query(`
            CREATE TABLE IF NOT EXISTS user_api_keys_chatapi (
                username TEXT NOT NULL,
                provider TEXT NOT NULL,
                encrypted_key TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (username, provider)
            )
        `);
  },

  getUserApiKeys: async (username) => {
    if (!USER_KEY_STORAGE_ENABLED) return {};
    await db.initUserApiKeyStore();
    const res = await pool.query(
      "SELECT provider, encrypted_key FROM user_api_keys_chatapi WHERE username = $1",
      [username]
    );
    return res.rows.reduce((acc, row) => {
      const decrypted = decryptKey(row.encrypted_key);
      if (decrypted) acc[row.provider] = decrypted;
      return acc;
    }, {});
  },

  saveUserApiKey: async (username, provider, apiKey) => {
    if (!USER_KEY_STORAGE_ENABLED)
      throw new Error(
        "User API key storage is not enabled. Set API_KEY_ENCRYPTION_SECRET."
      );
    await db.initUserApiKeyStore();
    if (!apiKey) {
      await pool.query(
        "DELETE FROM user_api_keys_chatapi WHERE username = $1 AND provider = $2",
        [username, provider]
      );
      return;
    }
    const encryptedKey = encryptKey(apiKey);
    await pool.query(
      `INSERT INTO user_api_keys_chatapi (username, provider, encrypted_key)
             VALUES ($1, $2, $3)
             ON CONFLICT (username, provider)
             DO UPDATE SET encrypted_key = $3, updated_at = CURRENT_TIMESTAMP`,
      [username, provider, encryptedKey]
    );
  },
};
