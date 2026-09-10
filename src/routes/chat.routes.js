import express from "express";
import { sessPerm } from "mbkauthe";
import { Permissions } from "../permissions.js";
import { checkMessageLimit } from "../middleware/check-message-limit.js";
import { getChatHistory, processChat, streamChat, clearChatHistory, listChatHistories, updateChatHistory, getUserApiKeys, saveUserApiKey, getUserSession } from "../controllers/chat.controller.js";

const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// --- ROUTES ---

// Load Chat API (Returns Full Tree) — ownership-checked
router.get("/api/chat/histories/:chatId", sessPerm(Permissions.history.read), getChatHistory);

// Main Chat Processing Route
router.post("/api/bot-chat", sessPerm(Permissions.chat.send), checkMessageLimit, processChat);

// Streaming Chat Route — SSE real-time response
router.post("/api/bot-chat/stream", sessPerm(Permissions.chat.stream), checkMessageLimit, streamChat);

// Soft Delete (Set is_deleted = TRUE) — ownership-checked
router.post("/api/chat/clear-history/:chatId", sessPerm(Permissions.history.clear), clearChatHistory);

// Fetch List (Filter is_deleted = FALSE) — supports ?search= query
router.get("/api/chat/histories", sessPerm(Permissions.history.read), listChatHistories);

// PATCH: Rename or toggle pin on a chat
router.patch("/api/chat/histories/:chatId", sessPerm(Permissions.history.rename), updateChatHistory);

router.get("/api/user/api-keys", sessPerm(Permissions.api_keys.manage), getUserApiKeys);

router.post("/api/user/api-keys", sessPerm(Permissions.api_keys.manage), saveUserApiKey);

// User Session Info (for React SPA)
router.get("/api/user/session", sessPerm(Permissions.session.read), getUserSession);

export default router;
