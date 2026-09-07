import { PostgresAdapter, SqliteAdapter, postgresDialect, sqliteDialect, BaseRepository, registerGracefulShutdown } from "mbkauthe";
import { pool, poolConfig, sqlitePath, dbType, initSchema } from "./connection.js";

let defaultAdapter;

if (dbType === "sqlite") {
  const adapter = new SqliteAdapter(sqlitePath, {
    dialect: sqliteDialect,
    jsonColumns: ["conversation_history", "sess"],
    booleanColumns: ["is_pinned", "is_deleted", "active", "is_active", "have_mail_account"],
    timestampColumns: ["created_at", "updated_at", "last_login"],
  });
  registerGracefulShutdown(adapter);
  defaultAdapter = adapter;

  // Auto-initialize SQLite schema idempotently
  if (process.env.NODE_ENV !== "test" || !process.env.JEST_WORKER_ID) {
    initSchema(adapter).catch((err) => {
      console.error("[sqlite] Schema initialization error:", err.message);
    });
  }
} else {
  defaultAdapter = new PostgresAdapter(pool, postgresDialect);
}

export const adapter = defaultAdapter;

export {
  defaultAdapter,
  pool,
  poolConfig,
  sqlitePath,
  dbType,
  initSchema,
  PostgresAdapter,
  postgresDialect,
  SqliteAdapter,
  sqliteDialect,
  BaseRepository,
};

export default defaultAdapter;
