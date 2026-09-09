import { describe, test, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp } from "../../helpers/createTestApp.js";
import { createTestDb, cleanupTestDb } from "../../helpers/createTestDb.js";
import { ChatRepository } from "../../../src/repositories/chat.repository.js";

describe("ChatAPI Admin Route Integration Tests", () => {
  let app;
  let adapter;
  let chatRepo;
  let adminChat1;
  let adminChat2;

  beforeAll(async () => {
    adapter = await createTestDb();
    chatRepo = new ChatRepository(adapter);
    app = createTestApp({ user: { username: "superadmin_user", role: "superadmin" } });

    // Seed test chats
    adminChat1 = await chatRepo.saveChat(
      null,
      { rootId: "a1", nodes: { a1: { id: "a1", role: "user", content: "Admin 1" } } },
      "testuser_1",
      "Admin Test Chat 1"
    );

    adminChat2 = await chatRepo.saveChat(
      null,
      { rootId: "a2", nodes: { a2: { id: "a2", role: "user", content: "Admin 2" } } },
      "testuser_2",
      "Admin Test Chat 2"
    );
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  describe("Access Control", () => {
    test("GET /api/admin/stats blocks non-superadmin users with 403", async () => {
      const normalUser = { username: "normie", role: "normaluser" };
      const res = await request(app)
        .get("/api/admin/stats")
        .set("x-test-user", JSON.stringify(normalUser));

      expect(res.status).toBe(403);
    });
  });

  describe("Admin Statistics & Data Management", () => {
    test("GET /api/admin/stats returns 200 with stats and hourly aggregations", async () => {
      const res = await request(app).get("/api/admin/stats");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("stats");
      expect(res.body).toHaveProperty("recentChats");
      expect(res.body).toHaveProperty("hourlyData");
      expect(Array.isArray(res.body.hourlyData)).toBe(true);
      expect(res.body.hourlyData.length).toBe(24);
    });

    test("GET /api/admin/users returns paginated users", async () => {
      const res = await request(app).get("/api/admin/users?page=1");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("users");
      expect(res.body).toHaveProperty("pagination");
      expect(Array.isArray(res.body.users)).toBe(true);
    });

    test("GET /api/admin/chats returns paginated chats", async () => {
      const res = await request(app).get("/api/admin/chats?page=1");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("chats");
      expect(Array.isArray(res.body.chats)).toBe(true);
      expect(res.body.chats.length).toBeGreaterThanOrEqual(2);
    });

    test("GET /api/admin/chat-detail/:id returns chat details and tree", async () => {
      const res = await request(app).get(`/api/admin/chat-detail/${adminChat1}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("chat");
      expect(res.body).toHaveProperty("treeData");
      expect(res.body.chat.id).toBe(adminChat1);
    });

    test("POST /api/admin/chats/bulk-delete deletes selected chats", async () => {
      const res = await request(app)
        .post("/api/admin/chats/bulk-delete")
        .send({ chatIds: [adminChat1, adminChat2] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted1 = await chatRepo.getChat(adminChat1);
      const deleted2 = await chatRepo.getChat(adminChat2);
      expect(deleted1).toBeNull();
      expect(deleted2).toBeNull();
    });
  });
});
