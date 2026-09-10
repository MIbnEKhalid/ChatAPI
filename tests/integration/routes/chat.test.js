import { describe, test, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp } from "../../helpers/createTestApp.js";
import { createTestDb, cleanupTestDb } from "../../helpers/createTestDb.js";
import { ChatRepository } from "../../../src/repositories/chat.repository.js";

describe("ChatAPI Route Integration Tests", () => {
  let app;
  let adapter;
  let chatRepo;

  beforeAll(async () => {
    adapter = await createTestDb();
    chatRepo = new ChatRepository(adapter);
    app = createTestApp({
      user: {
        username: "routeuser",
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
      },
    });
  });

  afterAll(async () => {
    await cleanupTestDb(adapter);
  });

  describe("User Session & API Keys", () => {
    test("GET /api/user/session returns user session and limits", async () => {
      const res = await request(app).get("/api/user/session");
      expect(res.status).toBe(200);
      expect(res.body.username).toBe("routeuser");
      expect(res.body.limits).toBeDefined();
      expect(res.body.limits).toHaveProperty("dailyLimit");
      expect(res.body.limits).toHaveProperty("messageCount");
    });

    test("GET /api/user/api-keys and POST /api/user/api-keys manages keys", async () => {
      const postRes = await request(app)
        .post("/api/user/api-keys")
        .send({ provider: "deepseek", apiKey: "sk-integration-test-key" });

      expect(postRes.status).toBe(200);
      expect(postRes.body.success).toBe(true);

      const getRes = await request(app).get("/api/user/api-keys");
      expect(getRes.status).toBe(200);
      expect(getRes.body.apiKeys).toBeDefined();
      expect(getRes.body.apiKeys.deepseek).toBe("configured");
    });
  });

  describe("Chat History & Management Routes", () => {
    let testChatId;

    beforeAll(async () => {
      // Seed a test chat for routeuser
      testChatId = await chatRepo.saveChat(
        null,
        { rootId: "n1", nodes: { n1: { id: "n1", role: "user", content: "Hi" } } },
        "routeuser",
        "Integration Chat"
      );
    });

    test("GET /api/chat/histories returns grouped user chats", async () => {
      const res = await request(app).get("/api/chat/histories");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("today");
      expect(res.body).toHaveProperty("pinned");
      expect(Array.isArray(res.body.today)).toBe(true);
      expect(res.body.today.some((c) => c.id === testChatId)).toBe(true);
    });

    test("GET /api/chat/histories/:chatId returns chat with parsed tree", async () => {
      const res = await request(app).get(`/api/chat/histories/${testChatId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testChatId);
      expect(res.body.title).toBe("Integration Chat");
      expect(res.body.treeData).toBeDefined();
    });

    test("GET /api/chat/histories/:chatId returns 404 for non-existent chat", async () => {
      const res = await request(app).get("/api/chat/histories/999999");
      expect(res.status).toBe(404);
    });

    test("PATCH /api/chat/histories/:chatId renames existing chat", async () => {
      const res = await request(app)
        .patch(`/api/chat/histories/${testChatId}`)
        .send({ action: "rename", title: "Updated Title" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.title).toBe("Updated Title");

      const updated = await chatRepo.getChat(testChatId, "routeuser");
      expect(updated.title).toBe("Updated Title");
    });

    test("PATCH /api/chat/histories/:chatId toggles pin status", async () => {
      const res = await request(app)
        .patch(`/api/chat/histories/${testChatId}`)
        .send({ action: "pin" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.is_pinned).toBe("boolean");
    });

    test("POST /api/chat/clear-history/:chatId soft deletes chat", async () => {
      const res = await request(app).post(`/api/chat/clear-history/${testChatId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted = await chatRepo.getChat(testChatId, "routeuser");
      expect(deleted).toBeNull();
    });
  });

  describe("Validation & Rate Limiting on /api/bot-chat", () => {
    test("POST /api/bot-chat rejects empty message with 400", async () => {
      const res = await request(app)
        .post("/api/bot-chat")
        .send({ message: "   " });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Empty message");
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe("EMPTY_MESSAGE");
    });

    test("POST /api/bot-chat rejects messages exceeding 10,000 chars with 400", async () => {
      const longMessage = "a".repeat(10001);
      const res = await request(app)
        .post("/api/bot-chat")
        .send({ message: longMessage });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Message too long");
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    test("GET /api/non-existent-chat-endpoint returns standardized JSON 404", async () => {
      const res = await request(app).get("/api/non-existent-chat-endpoint");
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
    });
  });
});
