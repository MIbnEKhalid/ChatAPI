/**
 * Global test setup for ChatAPI — runs before every test file.
 */
import { vi } from "vitest";

// Force SQLite in-memory mode for all tests
process.env.NODE_ENV = "test";
process.env.DB_TYPE = "sqlite";
process.env.SQLITE_PATH = ":memory:";

// Test encryption secrets
process.env.API_KEY_ENCRYPTION_SECRET = "test-secret-key-32-chars-long-abc";
process.env.MAIN_SECRET_TOKEN = "test-main-secret-token-for-chatapi";
process.env.SESSION_SECRET = "test-session-secret-for-chatapi";

// Dummy keys for AI provider tests
process.env.OPENAI_API_KEY = "sk-test-mock-openai-key";
process.env.DEEPSEEK_API_KEY = "sk-test-mock-deepseek-key";
process.env.ANTHROPIC_API_KEY = "sk-test-mock-anthropic-key";
process.env.GEMINI_API_KEY = "sk-test-mock-gemini-key";

// Mock validateSessionAndRole for route tests so session validation works cleanly
vi.mock("mbkauthe", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    validateSessionAndRole: (role = "Any") => (req, res, next) => {
      if (!req.session?.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (role && role !== "Any" && req.session.user.role !== role && req.session.user.role !== "superadmin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      next();
    },
  };
});
