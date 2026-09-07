#!/usr/bin/env node

/**
 * SQLite Database Initialization and Migration Script for ChatAPI.
 *
 * Usage:
 *   node src/scripts/init-sqlite.js [path-to-db] [--reset]
 *   npm run init-sqlite
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { SqliteAdapter, sqliteDialect, applySchema } from "mbkauthe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../");

dotenv.config();

const args = process.argv.slice(2);
const isReset = args.includes("--reset");
const customPathArg = args.find((arg) => !arg.startsWith("--"));

const dbPath = customPathArg
  ? path.resolve(process.cwd(), customPathArg)
  : process.env.SQLITE_PATH
  ? path.resolve(process.cwd(), process.env.SQLITE_PATH)
  : path.join(ROOT_DIR, "data", "chatapi.db");

const SCHEMA_PATH = path.join(ROOT_DIR, "src", "db", "schema", "schema.sqlite.sql");

async function main() {
  console.log("=== ChatAPI SQLite Initialization ===");
  console.log(`Target Database: ${dbPath}`);
  console.log(`Schema File:     ${SCHEMA_PATH}`);

  if (isReset && fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath);
      console.log("Existing database file removed (--reset specified).");
    } catch (err) {
      console.warn(`Could not remove existing file (${err.message}), continuing with incremental migration.`);
    }
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }

  const adapter = new SqliteAdapter(dbPath, {
    dialect: sqliteDialect,
    jsonColumns: ["conversation_history", "sess"],
    booleanColumns: ["is_pinned", "is_deleted", "active", "is_active", "have_mail_account"],
    timestampColumns: ["created_at", "updated_at", "last_login"],
  });

  // Ensure mbkcore_users columns if already existing
  try {
    const cols = adapter.db.prepare("PRAGMA table_info(mbkcore_users)").all().map((c) => c.name);
    if (cols.length > 0) {
      if (!cols.includes("user_id")) adapter.db.exec("ALTER TABLE mbkcore_users ADD COLUMN user_id TEXT");
      if (!cols.includes("image")) adapter.db.exec("ALTER TABLE mbkcore_users ADD COLUMN image TEXT DEFAULT 'https://portal.mbktech.org/icon.svg'");
      if (!cols.includes("last_login")) adapter.db.exec("ALTER TABLE mbkcore_users ADD COLUMN last_login TEXT");
      if (!cols.includes("is_blocked")) adapter.db.exec("ALTER TABLE mbkcore_users ADD COLUMN is_blocked INTEGER DEFAULT 0");
      if (!cols.includes("blocked_reason")) adapter.db.exec("ALTER TABLE mbkcore_users ADD COLUMN blocked_reason TEXT");
      if (!cols.includes("have_mail_account")) adapter.db.exec("ALTER TABLE mbkcore_users ADD COLUMN have_mail_account INTEGER DEFAULT 0");
      if (!cols.includes("two_fa_enabled")) adapter.db.exec("ALTER TABLE mbkcore_users ADD COLUMN two_fa_enabled INTEGER DEFAULT 0");
      if (!cols.includes("allowed_apps")) adapter.db.exec("ALTER TABLE mbkcore_users ADD COLUMN allowed_apps TEXT DEFAULT '[\"all\"]'");
      if (!cols.includes("avatar_url")) adapter.db.exec("ALTER TABLE mbkcore_users ADD COLUMN avatar_url TEXT");
      if (!cols.includes("full_name")) adapter.db.exec("ALTER TABLE mbkcore_users ADD COLUMN full_name TEXT");
      if (!cols.includes("password_hash")) adapter.db.exec("ALTER TABLE mbkcore_users ADD COLUMN password_hash TEXT");
    }

    const tfaCols = adapter.db.prepare("PRAGMA table_info(mbkcore_two_factor)").all().map((c) => c.name);
    if (tfaCols.length > 0) {
      if (!tfaCols.includes("is_enabled")) adapter.db.exec("ALTER TABLE mbkcore_two_factor ADD COLUMN is_enabled INTEGER DEFAULT 0");
      if (!tfaCols.includes("two_fa_secret")) adapter.db.exec("ALTER TABLE mbkcore_two_factor ADD COLUMN two_fa_secret TEXT");
    }

    const sessInfo = adapter.db.prepare("PRAGMA table_info(mbkcore_sessions)").all();
    const idCol = sessInfo.find((c) => c.name === "id");
    if (idCol && !idCol.dflt_value) {
      adapter.db.exec("DROP TABLE IF EXISTS mbkcore_sessions;");
    }

    const expressSessCols = adapter.db.prepare("PRAGMA table_info(mbkcore_session)").all().map((c) => c.name);
    if (expressSessCols.length > 0) {
      if (!expressSessCols.includes("username")) adapter.db.exec("ALTER TABLE mbkcore_session ADD COLUMN username VARCHAR(50)");
      if (!expressSessCols.includes("last_activity")) adapter.db.exec("ALTER TABLE mbkcore_session ADD COLUMN last_activity TEXT DEFAULT CURRENT_TIMESTAMP");
    }
  } catch {}

  console.log("Applying SQLite schema...");
  await applySchema(adapter, SCHEMA_PATH, { name: "chatapi", silent: false });

  // Inspect tables created
  const tables = adapter.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();

  console.log(`\nInitialization complete. Verified ${tables.length} tables:`);
  for (const { name } of tables) {
    try {
      const countRes = adapter.db.prepare(`SELECT COUNT(*) as count FROM "${name}"`).get();
      console.log(` - ${name.padEnd(30)} (${countRes.count} records)`);
    } catch {
      console.log(` - ${name}`);
    }
  }

  await adapter.close();
  console.log("\nDatabase ready.");
}

main().catch((err) => {
  console.error("Initialization failed:", err);
  process.exit(1);
});
