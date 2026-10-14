import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, cleanupTestDb } from "../helpers/createTestDb.js";
import { ChatRepository } from "../../src/repositories/chat.repository.js";
import { GET as getSession } from "../../app/api/user/session/route.js";
import { GET as getApiKeys, POST as saveApiKey } from "../../app/api/user/api-keys/route.js";
import { GET as getHistories } from "../../app/api/chat/histories/route.js";
import { GET as getChatHistory, PATCH as patchChatHistory } from "../../app/api/chat/histories/[chatId]/route.js";
import { POST as clearChatHistory } from "../../app/api/chat/clear-history/[chatId]/route.js";
import { POST as processChat } from "../../app/api/bot-chat/route.js";
import { GET as getAdminStats } from "../../app/api/admin/stats/route.js";
import { GET as getAdminUsers } from "../../app/api/admin/users/route.js";
import { GET as getAdminChats } from "../../app/api/admin/chats/route.js";
import { GET as getAdminChatDetail } from "../../app/api/admin/chat-detail/[id]/route.js";
import { POST as bulkDeleteAdminChats } from "../../app/api/admin/chats/bulk-delete/route.js";

describe("Next.js Route Handlers Integration Tests", () => {
  let adapter;
  let chatRepo;
  let testChatId;
  let adminChat1;
  let adminChat2;

  const testUser = {
    username: "nextuser",
    role: "normaluser",
    permissions: {
      allows: [
        "chatapi:chat:send",
        "chatapi:chat:stream",
        "chatapi:history:read",
        "chatapi:history:clear",
        "chatapi:history:rename",
        "chatapi:api_keys:manage",
        "chatapi:session:read",
      ],
      denies: [],
    },
  };

  const superadminUser = {
    username: "superadmin_user",
    role: "superadmin",
    permissions: {
      allows: ["*"],
      denies: [],
    },
  };

  beforeAll(async () => {
    adapter = await createTestDb();
    chatRepo = new ChatRepository(adapter);

    testChatId = await chatRepo.saveChat(
      null,
      { rootId: "n1", nodes: { n1: { id: "n1", role: "user", content: "Hi" } } },
      "nextuser",
      "Integration Chat"
    );

    adminChat1 = await chatRepo.saveChat(
      null,
      { rootId: "a1", nodes: { a1: { id: "a1", role: "user", content: "Admin 1" } } },
      "user_a",
      "Admin Chat 1"
    );

    adminChat2 = await chatRepo.saveChat(
      null,
      { rootId: "a2", nodes: { a2: { id: "a2", role: "user", content: "Admin 2" } } },
      "user_b",
      "Admin Chat 2"
    );
  });

  afterAll(async () => {
    await cleanupTestDb(adapter);
  });

  function createRequest(url, { method = "GET", body = null, user = testUser } = {}) {
    const headers = new Headers();
    if (user) {
      headers.set("x-test-user", JSON.stringify(user));
    }
    if (body) {
      headers.set("content-type", "application/json");
    }
    return new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
  }

  describe("User Session & API Keys", () => {
    test("GET /api/user/session returns user session and limits", async () => {
      const req = createRequest("http://localhost:3000/api/user/session");
      const res = await getSession(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.username).toBe("nextuser");
      expect(data.limits).toBeDefined();
      expect(data.limits).toHaveProperty("dailyLimit");
      expect(data.limits).toHaveProperty("messageCount");
    });

    test("GET /api/user/api-keys and POST /api/user/api-keys manage keys", async () => {
      const postReq = createRequest("http://localhost:3000/api/user/api-keys", {
        method: "POST",
        body: { provider: "deepseek", apiKey: "sk-next-test-key" },
      });
      const postRes = await saveApiKey(postReq);
      expect(postRes.status).toBe(200);

      const postData = await postRes.json();
      expect(postData.success).toBe(true);

      const getReq = createRequest("http://localhost:3000/api/user/api-keys");
      const getRes = await getApiKeys(getReq);
      expect(getRes.status).toBe(200);

      const getData = await getRes.json();
      expect(getData.apiKeys).toBeDefined();
      expect(getData.apiKeys.deepseek).toBe("configured");
    });
  });

  describe("Chat History & Management", () => {
    test("GET /api/chat/histories returns grouped histories", async () => {
      const req = createRequest("http://localhost:3000/api/chat/histories");
      const res = await getHistories(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("pinned");
      expect(data).toHaveProperty("today");
      expect(data).toHaveProperty("yesterday");
      expect(data).toHaveProperty("older");
      expect(data.today.some((c) => c.id === testChatId)).toBe(true);
    });

    test("GET /api/chat/histories/[chatId] returns chat with parsed tree", async () => {
      const req = createRequest(`http://localhost:3000/api/chat/histories/${testChatId}`);
      const res = await getChatHistory(req, { params: Promise.resolve({ chatId: String(testChatId) }) });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.id).toBe(testChatId);
      expect(data.title).toBe("Integration Chat");
      expect(data.treeData).toBeDefined();
    });

    test("GET /api/chat/histories/[chatId] returns 404 for non-existent chat", async () => {
      const req = createRequest("http://localhost:3000/api/chat/histories/999999");
      const res = await getChatHistory(req, { params: Promise.resolve({ chatId: "999999" }) });
      expect(res.status).toBe(404);
    });

    test("PATCH /api/chat/histories/[chatId] renames existing chat", async () => {
      const req = createRequest(`http://localhost:3000/api/chat/histories/${testChatId}`, {
        method: "PATCH",
        body: { action: "rename", title: "Updated Title" },
      });
      const res = await patchChatHistory(req, { params: Promise.resolve({ chatId: String(testChatId) }) });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.title).toBe("Updated Title");

      const updated = await chatRepo.getChat(testChatId, "nextuser");
      expect(updated.title).toBe("Updated Title");
    });

    test("PATCH /api/chat/histories/[chatId] toggles pin status", async () => {
      const req = createRequest(`http://localhost:3000/api/chat/histories/${testChatId}`, {
        method: "PATCH",
        body: { action: "pin" },
      });
      const res = await patchChatHistory(req, { params: Promise.resolve({ chatId: String(testChatId) }) });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(typeof data.is_pinned).toBe("boolean");
    });

    test("POST /api/chat/clear-history/[chatId] soft deletes chat", async () => {
      const req = createRequest(`http://localhost:3000/api/chat/clear-history/${testChatId}`, {
        method: "POST",
      });
      const res = await clearChatHistory(req, { params: Promise.resolve({ chatId: String(testChatId) }) });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      const deleted = await chatRepo.getChat(testChatId, "nextuser");
      expect(deleted).toBeNull();
    });
  });

  describe("Validation on /api/bot-chat", () => {
    test("POST /api/bot-chat rejects empty message with 400", async () => {
      const req = createRequest("http://localhost:3000/api/bot-chat", {
        method: "POST",
        body: { message: "   " },
      });
      const res = await processChat(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("EMPTY_MESSAGE");
    });

    test("POST /api/bot-chat rejects messages exceeding 10,000 chars with 400", async () => {
      const longMessage = "a".repeat(10001);
      const req = createRequest("http://localhost:3000/api/bot-chat", {
        method: "POST",
        body: { message: longMessage },
      });
      const res = await processChat(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("MESSAGE_TOO_LONG");
    });
  });

  describe("Admin Routes & Permissions", () => {
    test("GET /api/admin/stats blocks non-superadmin users with 403", async () => {
      const req = createRequest("http://localhost:3000/api/admin/stats", { user: testUser });
      const res = await getAdminStats(req);
      expect(res.status).toBe(403);
    });

    test("GET /api/admin/stats returns 200 with stats and hourly aggregations for superadmin", async () => {
      const req = createRequest("http://localhost:3000/api/admin/stats", { user: superadminUser });
      const res = await getAdminStats(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("stats");
      expect(data).toHaveProperty("recentChats");
      expect(data).toHaveProperty("hourlyData");
      expect(Array.isArray(data.hourlyData)).toBe(true);
      expect(data.hourlyData.length).toBe(24);
    });

    test("GET /api/admin/users returns paginated users", async () => {
      const req = createRequest("http://localhost:3000/api/admin/users?page=1", { user: superadminUser });
      const res = await getAdminUsers(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("users");
      expect(data).toHaveProperty("pagination");
      expect(Array.isArray(data.users)).toBe(true);
    });

    test("GET /api/admin/chats returns paginated chats", async () => {
      const req = createRequest("http://localhost:3000/api/admin/chats?page=1", { user: superadminUser });
      const res = await getAdminChats(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("chats");
      expect(Array.isArray(data.chats)).toBe(true);
      expect(data.chats.length).toBeGreaterThanOrEqual(2);
    });

    test("GET /api/admin/chat-detail/[id] returns chat details and tree", async () => {
      const req = createRequest(`http://localhost:3000/api/admin/chat-detail/${adminChat1}`, { user: superadminUser });
      const res = await getAdminChatDetail(req, { params: Promise.resolve({ id: String(adminChat1) }) });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("chat");
      expect(data).toHaveProperty("treeData");
      expect(data.chat.id).toBe(adminChat1);
    });

    test("POST /api/admin/chats/bulk-delete deletes selected chats", async () => {
      const req = createRequest("http://localhost:3000/api/admin/chats/bulk-delete", {
        method: "POST",
        user: superadminUser,
        body: { chatIds: [adminChat1, adminChat2] },
      });
      const res = await bulkDeleteAdminChats(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      const deleted1 = await chatRepo.getChat(adminChat1);
      const deleted2 = await chatRepo.getChat(adminChat2);
      expect(deleted1).toBeNull();
      expect(deleted2).toBeNull();
    });
  });
});
