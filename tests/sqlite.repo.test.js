import path from "path";
import { fileURLToPath } from "url";
import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { SqliteAdapter, sqliteDialect, applySchema, closeAllConnections } from "mbkauthe";

import { ChatRepository } from "../src/repositories/ChatRepository.js";
import { checkMessageLimit } from "../src/middleware/checkMessageLimit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_PATH = path.resolve(__dirname, "../src/db/schema/schema.sqlite.sql");

describe("ChatAPI SQLite Repository & Middleware Integration", () => {
  let adapter;
  let chatRepo;

  beforeAll(async () => {
    // Set encryption secret for key tests
    process.env.API_KEY_ENCRYPTION_SECRET = "test-secret-key-32-chars-long-abc";

    adapter = new SqliteAdapter(":memory:", {
      dialect: sqliteDialect,
      jsonColumns: ["conversation_history", "sess"],
      booleanColumns: ["is_pinned", "is_deleted", "active", "is_active", "have_mail_account"],
      timestampColumns: ["created_at", "updated_at", "last_login"],
    });

    await applySchema(adapter, SCHEMA_PATH, { silent: true, name: "chatapi-test-schema" });
    chatRepo = new ChatRepository(adapter);
  });

  afterAll(async () => {
    await adapter.close();
    await closeAllConnections();
  });

  describe("Chat End-User Operations", () => {
    let createdChatId;

    test("saves a new chat tree and returns its ID", async () => {
      const treeData = {
        rootId: "node-1",
        nodes: {
          "node-1": { id: "node-1", role: "user", content: "Hello AI" },
          "node-2": { id: "node-2", role: "assistant", content: "Hello! How can I help you?" },
        },
      };

      createdChatId = await chatRepo.saveChat(null, treeData, "user1", "My First Chat");
      expect(createdChatId).toBeDefined();
      expect(typeof createdChatId).toBe("number");
    });

    test("retrieves chat by ID and auto-parses JSON conversation_history", async () => {
      const chat = await chatRepo.getChat(createdChatId, "user1");
      expect(chat).not.toBeNull();
      expect(chat.id).toBe(createdChatId);
      expect(chat.title).toBe("My First Chat");
      expect(chat.username).toBe("user1");
      expect(chat.is_pinned).toBe(false);
      expect(chat.is_deleted).toBe(false);

      // JSON parser normalizes conversation_history to object
      expect(chat.conversation_history).toHaveProperty("rootId", "node-1");
      expect(chat.conversation_history.nodes["node-1"].content).toBe("Hello AI");
    });

    test("updates an existing chat tree and title", async () => {
      const updatedTree = {
        rootId: "node-1",
        nodes: {
          "node-1": { id: "node-1", role: "user", content: "Hello AI updated" },
        },
      };

      const resId = await chatRepo.saveChat(createdChatId, updatedTree, "user1", "Renamed Chat");
      expect(resId).toBe(createdChatId);

      const chat = await chatRepo.getChat(createdChatId, "user1");
      expect(chat.conversation_history.nodes["node-1"].content).toBe("Hello AI updated");
    });

    test("lists user chats with search and pin status", async () => {
      // Create second chat for user1
      await chatRepo.saveChat(null, { rootId: "node-a" }, "user1", "Python Guide");

      const allChats = await chatRepo.listUserChats("user1");
      expect(allChats.length).toBe(2);

      // Search matching title
      const filtered = await chatRepo.listUserChats("user1", { q: "python" });
      expect(filtered.length).toBe(1);
      expect(filtered[0].title).toBe("Python Guide");
    });

    test("renames a chat", async () => {
      const renamed = await chatRepo.renameChat(createdChatId, "Final Title", "user1");
      expect(renamed).toBe(true);

      const chat = await chatRepo.getChat(createdChatId, "user1");
      expect(chat.title).toBe("Final Title");
    });

    test("toggles pin status", async () => {
      const pinned = await chatRepo.togglePin(createdChatId, "user1");
      expect(pinned).toBe(true);

      const unpinned = await chatRepo.togglePin(createdChatId, "user1");
      expect(unpinned).toBe(false);
    });

    test("soft deletes a chat", async () => {
      const deleted = await chatRepo.softDeleteChat(createdChatId, "user1");
      expect(deleted).toBe(true);

      const chat = await chatRepo.getChat(createdChatId, "user1");
      expect(chat).toBeNull();
    });
  });

  describe("Limits and Settings", () => {
    test("fetches default message limits when no custom record exists", async () => {
      const limits = await chatRepo.getLimits("nonexistentuser");
      expect(limits.dailyLimit).toBe(100);
      expect(limits.messageCount).toBe(0);
    });

    test("fetches custom user limits and message logs", async () => {
      const today = new Date().toISOString().split("T")[0];
      await adapter.query(
        "INSERT INTO chatapi_user_settings (username, daily_message_limit) VALUES ($1, $2)",
        ["limiteduser", 50]
      );
      await adapter.query(
        "INSERT INTO chatapi_user_message_logs (username, date, message_count) VALUES ($1, $2, $3)",
        ["limiteduser", today, 12]
      );

      const limits = await chatRepo.getLimits("limiteduser");
      expect(limits.dailyLimit).toBe(50);
      expect(limits.messageCount).toBe(12);
    });
  });

  describe("API Key Management", () => {
    test("saves and decrypts user provider API key", async () => {
      await chatRepo.saveUserApiKey("keyuser", "deepseek", "sk-secret-test-key-12345");

      const keys = await chatRepo.getUserApiKeys("keyuser");
      expect(keys.deepseek).toBe("sk-secret-test-key-12345");
    });

    test("removes user provider key when passed falsy value", async () => {
      await chatRepo.saveUserApiKey("keyuser", "deepseek", null);

      const keys = await chatRepo.getUserApiKeys("keyuser");
      expect(keys.deepseek).toBeUndefined();
    });
  });

  describe("Admin Queries & Translations", () => {
    beforeAll(async () => {
      // Seed some test chats
      await chatRepo.saveChat(null, { root: 1 }, "admin_u1", "Admin Test Chat 1");
      await chatRepo.saveChat(null, { root: 2 }, "admin_u2", "Admin Test Chat 2");
      await chatRepo.saveChat(null, { root: 3 }, "admin_u2", "Admin Test Chat 3");
    });

    test("getAdminStats runs aggregations including EXTRACT(HOUR FROM created_at)", async () => {
      const adminStats = await chatRepo.getAdminStats();
      expect(adminStats).toHaveProperty("stats");
      expect(Number(adminStats.stats.total_chats)).toBeGreaterThanOrEqual(3);
      expect(adminStats.recentChats.length).toBeGreaterThan(0);
      expect(Array.isArray(adminStats.hourlyRows)).toBe(true);
    });

    test("getAdminUsers runs pagination and distinct counting", async () => {
      const result = await chatRepo.getAdminUsers({ page: 1, pageSize: 10 });
      expect(result.users.length).toBeGreaterThanOrEqual(2);
      expect(result.totalItems).toBeGreaterThanOrEqual(2);
      expect(result.totalPages).toBeGreaterThanOrEqual(1);
    });

    test("getAdminChats filters by username and status", async () => {
      const result = await chatRepo.getAdminChats({ page: 1, pageSize: 10, username: "admin_u2" });
      expect(result.chats.length).toBe(2);
    });

    test("bulkDeleteChats handles array expansion ANY($1::int[])", async () => {
      const id1 = await chatRepo.saveChat(null, { x: 1 }, "bulk_u", "Bulk 1");
      const id2 = await chatRepo.saveChat(null, { x: 2 }, "bulk_u", "Bulk 2");

      const ok = await chatRepo.bulkDeleteChats([id1, id2]);
      expect(ok).toBe(true);

      const chat1 = await chatRepo.getChat(id1);
      const chat2 = await chatRepo.getChat(id2);
      expect(chat1).toBeNull();
      expect(chat2).toBeNull();
    });
  });

  describe("checkMessageLimit Middleware", () => {
    test("bypasses check for superadmin", async () => {
      const req = {
        session: { user: { username: "admin", role: "superadmin" } },
        headers: {},
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      let calledNext = false;
      const next = () => {
        calledNext = true;
      };

      await checkMessageLimit(req, res, next, adapter);
      expect(calledNext).toBe(true);
    });

    test("increments message count within transaction and allows request under limit", async () => {
      const req = {
        session: { user: { username: "normuser", role: "normaluser" } },
        headers: {},
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      let calledNext = false;
      const next = () => {
        calledNext = true;
      };

      await checkMessageLimit(req, res, next, adapter);
      expect(calledNext).toBe(true);

      // Verify count in db
      const today = new Date().toISOString().split("T")[0];
      const log = await adapter.query(
        "SELECT message_count FROM chatapi_user_message_logs WHERE username = $1 AND date = $2",
        ["normuser", today]
      );
      expect(log.rows[0].message_count).toBe(1);
    });

    test("blocks request with 429 when message limit is exceeded", async () => {
      const today = new Date().toISOString().split("T")[0];
      await adapter.query(
        "INSERT INTO chatapi_user_settings (username, daily_message_limit) VALUES ($1, $2)",
        ["cappeduser", 1]
      );
      await adapter.query(
        "INSERT INTO chatapi_user_message_logs (username, date, message_count) VALUES ($1, $2, $3)",
        ["cappeduser", today, 1]
      );

      const req = {
        session: { user: { username: "cappeduser", role: "normaluser" } },
        headers: {},
      };
      let capturedStatus;
      let capturedBody;
      const res = {
        status: vi.fn((code) => {
          capturedStatus = code;
          return {
            json: vi.fn((body) => {
              capturedBody = body;
            }),
          };
        }),
      };
      let calledNext = false;
      const next = () => {
        calledNext = true;
      };

      await checkMessageLimit(req, res, next, adapter);
      expect(calledNext).toBe(false);
      expect(capturedStatus).toBe(429);
      expect(capturedBody.message).toBe("Daily message limit reached");
    });
  });
});
