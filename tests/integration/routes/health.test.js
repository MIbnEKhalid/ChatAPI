import { describe, test, expect, beforeAll } from "vitest";
import request from "supertest";
import { createTestApp } from "../../helpers/createTestApp.js";

describe("ChatAPI Health Route Integration Tests", () => {
  let app;
  const healthSecret = "test-secret-chatapi";

  beforeAll(() => {
    process.env.HEALTH_TEST_KEY = healthSecret;
    app = createTestApp();
  });

  test("GET /api/health returns 200 with standard healthy payload", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("healthy");
    expect(res.body.app).toBe("ChatAPI");
  });

  test("GET /health redirects to /api/health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/api/health");
  });

  test("POST /api/health/test without auth fails with 401", async () => {
    const res = await request(app).post("/api/health/test");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("POST /api/health/test with valid secret triggers health run", async () => {
    const res = await request(app)
      .post("/api/health/test")
      .set("x-health-key", healthSecret);

    expect(res.status).toBe(200);
    expect(res.body.appName).toBe("ChatAPI");
    expect(["healthy", "degraded"]).toContain(res.body.health);
    expect(Array.isArray(res.body.routes)).toBe(true);
    expect(res.body.summary.totalRoutesChecked).toBeGreaterThan(0);
  });
});
