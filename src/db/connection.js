import pkg from "pg";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { applySchema, registerGracefulShutdown } from "mbkauthe";

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../");

dotenv.config();

export const dbType = (process.env.DB_TYPE || "postgres").toLowerCase();

/** Path to SQLite database file (used when DB_TYPE=sqlite). */
export const sqlitePath = process.env.SQLITE_PATH || path.join(ROOT_DIR, "data", "chatapi.db");

// Ensure data directory exists if using SQLite file path
if (dbType === "sqlite" && sqlitePath !== ":memory:") {
  const dir = path.dirname(path.resolve(sqlitePath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const poolConfig = {
  connectionString: process.env.NEON_POSTGRES,
  ssl: {
    rejectUnauthorized: true,
  },
};

const dummyPool = {
  query: async () => ({ rows: [], rowCount: 0 }),
  connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => {} }),
  on: () => {},
  end: async () => {},
};

export const pool = dbType !== "sqlite" ? new Pool(poolConfig) : dummyPool;

if (dbType !== "sqlite" && pool) {
  registerGracefulShutdown(pool);
}

function ensureSqliteUserColumns(target) {
  try {
    const db = target.db || target;
    if (typeof db.prepare === "function") {
      const cols = db.prepare("PRAGMA table_info(mbkcore_users)").all().map((c) => c.name);
      if (cols.length > 0) {
        if (!cols.includes("user_id")) db.exec("ALTER TABLE mbkcore_users ADD COLUMN user_id TEXT");
        if (!cols.includes("image")) db.exec("ALTER TABLE mbkcore_users ADD COLUMN image TEXT DEFAULT 'https://portal.mbktech.org/icon.svg'");
        if (!cols.includes("last_login")) db.exec("ALTER TABLE mbkcore_users ADD COLUMN last_login TEXT");
        if (!cols.includes("is_blocked")) db.exec("ALTER TABLE mbkcore_users ADD COLUMN is_blocked INTEGER DEFAULT 0");
        if (!cols.includes("blocked_reason")) db.exec("ALTER TABLE mbkcore_users ADD COLUMN blocked_reason TEXT");
        if (!cols.includes("have_mail_account")) db.exec("ALTER TABLE mbkcore_users ADD COLUMN have_mail_account INTEGER DEFAULT 0");
        if (!cols.includes("two_fa_enabled")) db.exec("ALTER TABLE mbkcore_users ADD COLUMN two_fa_enabled INTEGER DEFAULT 0");
        if (!cols.includes("allowed_apps")) db.exec("ALTER TABLE mbkcore_users ADD COLUMN allowed_apps TEXT DEFAULT '[\"all\"]'");
        if (!cols.includes("avatar_url")) db.exec("ALTER TABLE mbkcore_users ADD COLUMN avatar_url TEXT");
        if (!cols.includes("full_name")) db.exec("ALTER TABLE mbkcore_users ADD COLUMN full_name TEXT");
        if (!cols.includes("password_hash")) db.exec("ALTER TABLE mbkcore_users ADD COLUMN password_hash TEXT");
      }

      const tfaCols = db.prepare("PRAGMA table_info(mbkcore_two_factor)").all().map((c) => c.name);
      if (tfaCols.length > 0) {
        if (!tfaCols.includes("is_enabled")) db.exec("ALTER TABLE mbkcore_two_factor ADD COLUMN is_enabled INTEGER DEFAULT 0");
        if (!tfaCols.includes("two_fa_secret")) db.exec("ALTER TABLE mbkcore_two_factor ADD COLUMN two_fa_secret TEXT");
      }

      const sessInfo = db.prepare("PRAGMA table_info(mbkcore_sessions)").all();
      const idCol = sessInfo.find((c) => c.name === "id");
      if (idCol && !idCol.dflt_value) {
        db.exec("DROP TABLE IF EXISTS mbkcore_sessions;");
      }

      const expressSessCols = db.prepare("PRAGMA table_info(mbkcore_session)").all().map((c) => c.name);
      if (expressSessCols.length > 0) {
        if (!expressSessCols.includes("username")) db.exec("ALTER TABLE mbkcore_session ADD COLUMN username VARCHAR(50)");
        if (!expressSessCols.includes("last_activity")) db.exec("ALTER TABLE mbkcore_session ADD COLUMN last_activity TEXT DEFAULT CURRENT_TIMESTAMP");
      }
    }
  } catch (err) {
    console.warn("[sqlite] Could not verify/alter mbkcore columns:", err.message);
  }
}

export async function initSchema(target = pool) {
  const isSqlite =
    dbType === "sqlite" ||
    (target && (target.db || typeof target.prepare === "function" || target.constructor?.name === "SqliteAdapter" || target.constructor?.name === "SqlitePool"));

  const schemaFile = isSqlite ? "schema/schema.sqlite.sql" : "schema/schema.sql";
  const schemaPath = path.resolve(__dirname, schemaFile);

  if (isSqlite) {
    ensureSqliteUserColumns(target);
  }

  await applySchema(target, schemaPath, { name: "chatapi" });
}

// Initial connectivity probe in PostgreSQL mode
if (dbType !== "sqlite") {
  (async () => {
    try {
      const client = await pool.connect();
      client.release();
    } catch (err) {
      console.error("Database connection error (pool):", err);
    }
  })();
}

export default pool;
