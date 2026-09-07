import path from "path";
import { fileURLToPath } from "url";
import { applySchema, closeAllConnections } from "mbkauthe";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_PATH = path.resolve(__dirname, "../../src/db/schema/schema.sqlite.sql");

/**
 * Initializes and returns the shared singleton database adapter with the schema applied.
 * Uses the defaultAdapter from src/db/index.js so that routes and tests share the same database.
 * @returns {Promise<import("mbkauthe").SqliteAdapter>}
 */
export async function createTestDb() {
  const { defaultAdapter } = await import("../../src/db/index.js");
  await applySchema(defaultAdapter, SCHEMA_PATH, { silent: true, name: "chatapi-test-schema" });
  return defaultAdapter;
}

/**
 * Clean up connections gracefully after test completion.
 */
export async function cleanupTestDb() {
  try {
    await closeAllConnections();
  } catch {
    // ignore
  }
}
