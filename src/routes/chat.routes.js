import express from "express";
import { validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "../middleware/check-message-limit.js";
import {
  getChatHistory,
  processChat,
  streamChat,
  clearChatHistory,
  listChatHistories,
  updateChatHistory,
  getUserApiKeys,
  saveUserApiKey,
  getUserSession,
} from "../controllers/chat.controller.js";

const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// --- ROUTES ---

// Load Chat API (Returns Full Tree) — ownership-checked
router.get("/api/chat/histories/:chatId", validateSessionAndRole("Any"), getChatHistory);

// Main Chat Processing Route
router.post("/api/bot-chat", checkMessageLimit, processChat);

// Streaming Chat Route — SSE real-time response
router.post("/api/bot-chat/stream", checkMessageLimit, streamChat);

// Soft Delete (Set is_deleted = TRUE) — ownership-checked
router.post("/api/chat/clear-history/:chatId", validateSessionAndRole("Any"), clearChatHistory);

// Fetch List (Filter is_deleted = FALSE) — supports ?search= query
router.get("/api/chat/histories", validateSessionAndRole("Any"), listChatHistories);

// PATCH: Rename or toggle pin on a chat
router.patch("/api/chat/histories/:chatId", validateSessionAndRole("Any"), updateChatHistory);

router.get("/api/user/api-keys", validateSessionAndRole("Any"), getUserApiKeys);

router.post("/api/user/api-keys", validateSessionAndRole("Any"), saveUserApiKey);

// User Session Info (for React SPA)
router.get("/api/user/session", validateSessionAndRole("Any"), getUserSession);

export default router;
