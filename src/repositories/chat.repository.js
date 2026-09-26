import { BaseRepository } from "mbkauthe";
import { defaultAdapter } from "../db/index.js";
import { decryptKey, encryptKey, USER_KEY_STORAGE_ENABLED } from "../utils/crypto.js";

if (!USER_KEY_STORAGE_ENABLED) {
  console.warn(
    "API_KEY_ENCRYPTION_SECRET is not set. User-provided AI keys are disabled until the environment variable is configured."
  );
}

export class ChatRepository extends BaseRepository {
  constructor(adapter = defaultAdapter) {
    super(adapter, {
      defaultTable: "chatapi_ai_history",
      jsonColumns: ["conversation_history"],
      booleanColumns: ["is_deleted", "is_pinned"],
      dateColumns: ["created_at", "updated_at"],
    });
  }

  // --- Chat End-User Operations ---

  async getChat(id, username = null) {
    let sql = "SELECT * FROM chatapi_ai_history WHERE id = $1 AND is_deleted = FALSE";
    const params = [id];
    if (username) {
      sql += " AND username = $2";
      params.push(username);
    }
    const res = await this.query(sql, params);
    return res.rows[0] ? this.normalizeEntity(res.rows[0]) : null;
  }

  async saveChat(id, treeData, username, title = null) {
    const json = typeof treeData === "string" ? treeData : JSON.stringify(treeData);
    if (id) {
      if (title) {
        await this.query(
          "UPDATE chatapi_ai_history SET conversation_history = $1, title = COALESCE(title, $3), updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [json, id, title]
        );
      } else {
        await this.query(
          "UPDATE chatapi_ai_history SET conversation_history = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [json, id]
        );
      }
      return id;
    } else {
      const res = await this.query(
        "INSERT INTO chatapi_ai_history (conversation_history, username, title) VALUES ($1, $2, $3) RETURNING id",
        [json, username, title]
      );
      return res.rows[0]?.id;
    }
  }

  async softDeleteChat(id, username) {
    const res = await this.query(
      "UPDATE chatapi_ai_history SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND username = $2 RETURNING id",
      [id, username]
    );
    return (res.rowCount || res.rows.length) > 0;
  }

  async listUserChats(username, options = {}) {
    const params = [username];
    let sql = "SELECT id, title, is_pinned, created_at FROM chatapi_ai_history WHERE username = $1 AND is_deleted = FALSE";

    if (options.q && String(options.q).trim()) {
      params.push(`%${options.q.trim()}%`);
      if (this.dialect.name === "sqlite") {
        sql += ` AND (title LIKE $${params.length} OR conversation_history LIKE $${params.length})`;
      } else {
        sql += ` AND (title ILIKE $${params.length} OR conversation_history::text ILIKE $${params.length})`;
      }
    }

    sql += " ORDER BY is_pinned DESC, created_at DESC";
    const res = await this.query(sql, params);
    return (res.rows || []).map((row) => this.normalizeEntity(row));
  }

  async renameChat(id, title, username) {
    const res = await this.query(
      "UPDATE chatapi_ai_history SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND username = $3 AND is_deleted = FALSE RETURNING id",
      [title, id, username]
    );
    return (res.rowCount || res.rows.length) > 0;
  }

  async togglePin(id, username) {
    const res = await this.query(
      "UPDATE chatapi_ai_history SET is_pinned = NOT is_pinned, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND username = $2 AND is_deleted = FALSE RETURNING is_pinned",
      [id, username]
    );
    const row = res.rows[0] ? this.normalizeEntity(res.rows[0]) : null;
    return row?.is_pinned ?? null;
  }

  async getLimits(username) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const [settings, logs] = await Promise.all([
        this.query("SELECT daily_message_limit FROM chatapi_user_settings WHERE username = $1", [username])
          .catch(() => ({ rows: [] })),
        this.query("SELECT message_count FROM chatapi_user_message_logs WHERE username = $1 AND date = $2", [
          username,
          today,
        ]).catch(() => ({ rows: [] })),
      ]);
      return {
        dailyLimit: settings.rows[0]?.daily_message_limit || 100,
        messageCount: logs.rows[0]?.message_count || 0,
      };
    } catch {
      return { dailyLimit: 100, messageCount: 0 };
    }
  }

  async initUserApiKeyStore() {
    if (!USER_KEY_STORAGE_ENABLED) return;
    await this.query(`
      CREATE TABLE IF NOT EXISTS chatapi_user_api_keys (
        username VARCHAR(50) NOT NULL,
        provider TEXT NOT NULL,
        encrypted_key TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (username, provider)
      )
    `);
  }

  async getUserApiKeys(username) {
    if (!USER_KEY_STORAGE_ENABLED) return {};
    await this.initUserApiKeyStore();
    const res = await this.query(
      "SELECT provider, encrypted_key FROM chatapi_user_api_keys WHERE username = $1",
      [username]
    );
    return res.rows.reduce((acc, row) => {
      const decrypted = decryptKey(row.encrypted_key);
      if (decrypted) acc[row.provider] = decrypted;
      return acc;
    }, {});
  }

  async saveUserApiKey(username, provider, apiKey) {
    if (!USER_KEY_STORAGE_ENABLED) {
      throw new Error("User API key storage is not enabled. Set API_KEY_ENCRYPTION_SECRET.");
    }
    await this.initUserApiKeyStore();
    if (!apiKey) {
      await this.query(
        "DELETE FROM chatapi_user_api_keys WHERE username = $1 AND provider = $2",
        [username, provider]
      );
      return;
    }
    const encryptedKey = encryptKey(apiKey);
    await this.query(
      `INSERT INTO chatapi_user_api_keys (username, provider, encrypted_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (username, provider)
       DO UPDATE SET encrypted_key = $3, updated_at = CURRENT_TIMESTAMP`,
      [username, provider, encryptedKey]
    );
  }

  // --- Admin Operations ---

  async getAdminStats() {
    const statsQuery = `SELECT 
      (SELECT COUNT(*) FROM chatapi_ai_history) as total_chats, 
      (SELECT COUNT(*) FROM chatapi_ai_history WHERE is_deleted = TRUE) as deleted_chats, 
      (SELECT COUNT(DISTINCT username) FROM chatapi_ai_history) as unique_users`;
    const recentChatsQuery = `SELECT id, username, created_at, conversation_history, is_deleted 
      FROM chatapi_ai_history ORDER BY created_at DESC LIMIT 10`;
    const hourlyVolumeQuery = this.dialect.name === "sqlite"
      ? `SELECT strftime('%H', created_at) as hour, COUNT(*) as count 
         FROM chatapi_ai_history WHERE date(created_at) >= date('now') GROUP BY hour ORDER BY hour`
      : `SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count 
         FROM chatapi_ai_history WHERE created_at >= CURRENT_DATE GROUP BY hour ORDER BY hour`;

    const [statsRes, recentRes, hourlyRes] = await Promise.all([
      this.query(statsQuery),
      this.query(recentChatsQuery),
      this.query(hourlyVolumeQuery),
    ]);

    return {
      stats: statsRes.rows[0] || {},
      recentChats: (recentRes.rows || []).map((row) => this.normalizeEntity(row)),
      hourlyRows: hourlyRes.rows || [],
    };
  }

  async getAdminUsers({ page = 1, pageSize = 20, search = "" } = {}) {
    const offset = (page - 1) * pageSize;
    let whereClause = "";
    const params = [];
    if (search) {
      whereClause = this.dialect.name === "sqlite" ? "WHERE username LIKE $1" : "WHERE username ILIKE $1";
      params.push(`%${search}%`);
    }

    const usersQuery = `SELECT username, COUNT(*) as total_chats, MAX(created_at) as last_active 
      FROM chatapi_ai_history ${whereClause} 
      GROUP BY username ORDER BY last_active DESC 
      LIMIT ${pageSize} OFFSET ${offset}`;
    const countQuery = `SELECT COUNT(DISTINCT username) AS count FROM chatapi_ai_history ${whereClause}`;

    const [usersRes, countRes] = await Promise.all([
      this.query(usersQuery, params),
      this.query(countQuery, params),
    ]);

    const totalItems = parseInt(countRes.rows[0]?.count || 0, 10);
    const totalPages = Math.ceil(totalItems / pageSize) || 1;

    return {
      users: usersRes.rows || [],
      totalItems,
      totalPages,
    };
  }

  async getAdminChats({ page = 1, pageSize = 20, username = "", status = "" } = {}) {
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];

    if (username) {
      const matchOp = this.dialect.name === "sqlite" ? "LIKE" : "ILIKE";
      conditions.push(`username ${matchOp} $${params.length + 1}`);
      params.push(`%${username}%`);
    }
    if (status === "deleted") {
      conditions.push(`is_deleted = TRUE`);
    } else if (status === "active") {
      conditions.push(`is_deleted = FALSE`);
    }

    const whereSQL = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const chatsQuery = `SELECT id, username, created_at, conversation_history, is_deleted 
      FROM chatapi_ai_history ${whereSQL} 
      ORDER BY created_at DESC 
      LIMIT ${pageSize} OFFSET ${offset}`;
    const countQuery = `SELECT COUNT(*) AS count FROM chatapi_ai_history ${whereSQL}`;

    const [chatsRes, countRes] = await Promise.all([
      this.query(chatsQuery, params),
      this.query(countQuery, params),
    ]);

    const totalItems = parseInt(countRes.rows[0]?.count || 0, 10);
    const totalPages = Math.ceil(totalItems / pageSize) || 1;

    return {
      chats: (chatsRes.rows || []).map((row) => this.normalizeEntity(row)),
      totalItems,
      totalPages,
    };
  }

  async getAdminChatDetail(id) {
    const { rows } = await this.query("SELECT * FROM chatapi_ai_history WHERE id = $1", [id]);
    return rows[0] ? this.normalizeEntity(rows[0]) : null;
  }

  async bulkDeleteChats(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return false;
    if (this.dialect.name === "sqlite") {
      const placeholders = ids.map(() => "?").join(",");
      await this.query(`UPDATE chatapi_ai_history SET is_deleted = 1 WHERE id IN (${placeholders})`, ids);
    } else {
      await this.query("UPDATE chatapi_ai_history SET is_deleted = TRUE WHERE id = ANY($1::int[])", [ids]);
    }
    return true;
  }
}

export const chatRepository = new ChatRepository();
export default chatRepository;
