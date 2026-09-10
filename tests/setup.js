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

// Mock session validation + the dynamic permission API for route tests
vi.mock("mbkauthe", async (importOriginal) => {
  const actual = await importOriginal();
  const segmentMatch = (a, b) => a === "*" || b === "*" || a === b;
  const permMatch = (stored, required) => {
    const a = String(stored || "").toLowerCase().split(":");
    const b = String(required || "").toLowerCase().split(":");
    return a.length === 3 && b.length === 3 && segmentMatch(a[0], b[0]) && segmentMatch(a[1], b[1]) && segmentMatch(a[2], b[2]);
  };
  const denies = (user, permission) => {
    const perms = user?.permissions;
    if (!perms || Array.isArray(perms)) return false;
    return (perms.denies || []).some((d) => permMatch(d, permission));
  };
  const allows = (user, permission) => {
    const perms = user?.permissions;
    if (!perms) return false;
    const list = Array.isArray(perms) ? perms : perms.allows || [];
    return list.some((a) => permMatch(a, permission));
  };
  const checkPermission = (permission) => (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.role === "superadmin") return next();
    if (denies(user, permission)) return res.status(403).json({ message: "Forbidden" });
    if (allows(user, permission)) return next();
    return res.status(403).json({ message: "Forbidden" });
  };

  return {
    ...actual,
    hasPermission: (user, permission) => {
      if (!user) return false;
      if (user.role === "superadmin") return true;
      if (denies(user, permission)) return false;
      return allows(user, permission);
    },
    sessPerm: checkPermission,
    permChk: checkPermission,
    validateSessionAndPermission: (permission) => checkPermission(permission),
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
