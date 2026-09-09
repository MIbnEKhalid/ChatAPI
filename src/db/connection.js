import pkg from "pg";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { registerGracefulShutdown } from "mbkauthe";

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
  connectionString: process.env.NEON_POSTGRES || process.env.DATABASE_URL,
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

if (dbType !== "sqlite" && pool && typeof pool.on === "function") {
  registerGracefulShutdown(pool);
}

export default pool;
