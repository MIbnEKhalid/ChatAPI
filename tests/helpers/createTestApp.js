import express from "express";
import { createNotFoundHandler, createErrorHandler } from "mbkauthe";
import chatRoutes from "../../src/routes/chat.routes.js";
import adminRoutes from "../../src/routes/admin.routes.js";

/**
 * Creates an Express test app with mockable session authentication.
 * @param {Object} [options]
 * @param {Object} [options.user] - Default user session
 * @returns {express.Application}
 */
export function createTestApp({ user = { username: "testuser", role: "normaluser" } } = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session middleware supporting header-based user override for multi-role testing
  app.use((req, res, next) => {
    const userOverride = req.headers["x-test-user"]
      ? JSON.parse(req.headers["x-test-user"])
      : user;
    req.session = { user: userOverride };
    next();
  });

  app.use("/", chatRoutes);
  app.use("/", adminRoutes);

  app.use(createNotFoundHandler({ appName: "ChatAPI" }));
  app.use(createErrorHandler({ appName: "ChatAPI" }));

  return app;
}
