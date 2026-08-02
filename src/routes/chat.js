import express from "express";
import { pool } from "../config/database.js";
import { validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "../middleware/checkMessageLimit.js";
import { ChatTree } from "../models/chatTree.js";
import aiServices from "../services/aiService.js";
import { db } from "../repositories/chatRepository.js";
import { AI_PROVIDER, DEEPSEEK_MODELS } from "../config/ai.js";

const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// --- 5. ROUTES ---

// Render Page
router.get(
  ["/chatbot/:chatId?", "/chat/:chatId?"],
  validateSessionAndRole("Any"),
  async (req, res) => {
    try {
      const limits = await db.getLimits(req.session.user.username);
      res.render("mainPages/chatbot.handlebars", {
        layout: false,
        chatId: req.params.chatId || null,
        username: req.session.user.username,
        role: req.session.user.role,
        limits,
      });
    } catch (error) {
      console.error("Chat Interface Error:", error);
      res.status(500).send("Error loading chat interface.");
    }
  }
);

// Load Chat API (Returns Full Tree) — ownership-checked
router.get(
  "/api/chat/histories/:chatId",
  validateSessionAndRole("Any"),
  async (req, res) => {
    try {
      const chat = await db.getChat(req.params.chatId, req.session.user.username);
      if (!chat) return res.status(404).json({ message: "Not found" });

      // Parse tree
      let history =
        typeof chat.conversation_history === "string"
          ? JSON.parse(chat.conversation_history)
          : chat.conversation_history;
      const tree = new ChatTree(history);

      res.json({ ...chat, treeData: tree.toJSON() });
    } catch (error) {
      console.error("Load Chat Error:", error);
      res.status(500).json({ message: "Error loading chat history" });
    }
  }
);

// Main Chat Processing Route
router.post("/api/bot-chat", checkMessageLimit, async (req, res) => {
  const { message, chatId, parentMessageId, model: modelStr, temperature: tempParam } = req.body;
  const { username } = req.session.user;

  // Validate and sanitize input
  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) return res.status(400).json({ message: "Empty message" });
  if (trimmedMessage.length > 10000) return res.status(400).json({ message: "Message too long (max 10,000 characters)" });

  try {
    const temp = parseFloat(tempParam) || 0.7;

    // Model Parsing
    let modelName = (modelStr || "deepseek/deepseek-v4-flash").split("/").pop();
    if (!DEEPSEEK_MODELS.has(modelName)) {
      modelName = "deepseek-v4-flash";
    }

    // 1. Load Tree or Init New
    let tree;
    let dbId = chatId;

    if (dbId) {
      const chat = await db.getChat(dbId);
      if (chat) {
        const rawData =
          typeof chat.conversation_history === "string"
            ? JSON.parse(chat.conversation_history)
            : chat.conversation_history;
        tree = new ChatTree(rawData);
      } else {
        // ID provided but not found (deleted?), treat as new
        tree = new ChatTree(null);
        dbId = null;
      }
    } else {
      tree = new ChatTree(null);
      tree.addMessage("system", "You are a helpful AI assistant. Be concise.", null);
    }

    // 2. Add User Node
    // If parentMessageId exists (Editing/Branching), use it. Else use current leaf.
    const parentId = parentMessageId || tree.currentLeafId;
    const userNodeId = tree.addMessage("user", trimmedMessage, parentId);

    // 3. Get Context for AI (Linear History from User Node up to Root)
    const historyForAI = tree.getThread(userNodeId);

    // 4. Generate AI Response
    const userApiKeys = await db.getUserApiKeys(username);
    const userApiKey = userApiKeys.deepseek;
    // Use user-provided API token if available; otherwise fall back to the shared system token.
    const requestConfig = { ...AI_PROVIDER, apiKey: userApiKey || AI_PROVIDER.apiKey };

    if (!requestConfig.apiKey) {
      throw new Error(
        "No DeepSeek API token configured. Add a valid token in your account settings or set DEEPSEEK_API_TOKEN in environment variables."
      );
    }

    const responseText = await aiServices.openaiCompatible(
      requestConfig,
      modelName,
      historyForAI,
      temp
    );

    // 5. Add AI Node (Child of User Node)
    tree.addMessage("model", responseText, userNodeId);

    // 6. Save (No Temperature Column)
    const newChatId = await db.saveChat(dbId, tree.toJSON(), username);

    res.json({
      aiResponse: responseText,
      newChatId,
      treeData: tree.toJSON(),
    });
  } catch (error) {
    console.error("Chat Error:", error);
    // Handle Rate Limits specially
    const status = error.message.includes("429") ? 429 : 500;
    res.status(status).json({ message: error.message });
  }
});

// Soft Delete (Set is_deleted = TRUE) — ownership-checked
router.post(
  "/api/chat/clear-history/:chatId",
  validateSessionAndRole("Any"),
  async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        "UPDATE ai_history_chatapi SET is_deleted = TRUE WHERE id = $1 AND username = $2",
        [req.params.chatId, req.session.user.username]
      );
      if (rowCount === 0) {
        return res.status(403).json({ success: false, message: "Not authorized or not found" });
      }
      res.json({ success: true, message: "Chat moved to trash" });
    } catch (e) {
      console.error("Clear Chat Error:", e);
      res.status(500).json({ success: false, message: e.message });
    }
  }
);

// Fetch List (Filter is_deleted = FALSE)
router.get("/api/chat/histories", validateSessionAndRole("Any"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, created_at FROM ai_history_chatapi WHERE username = $1 AND is_deleted = FALSE ORDER BY updated_at DESC",
      [req.session.user.username]
    );

    // Grouping
    const grouped = { today: [], yesterday: [], older: [] };
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    rows.forEach((r) => {
      const d = new Date(r.created_at);
      const dTime = new Date(d).setHours(0, 0, 0, 0);

      const obj = { id: r.id, created_at: d.toLocaleDateString() };

      if (dTime === today.getTime()) grouped.today.push(obj);
      else if (dTime === yesterday.getTime()) grouped.yesterday.push(obj);
      else grouped.older.push(obj);
    });

    res.json(grouped);
  } catch (e) {
    console.error("History List Error:", e);
    res.status(500).json({ message: "Error loading list" });
  }
});

router.get("/api/user/api-keys", validateSessionAndRole("Any"), async (req, res) => {
  try {
    const apiKeys = await db.getUserApiKeys(req.session.user.username);
    const response = { deepseek: apiKeys.deepseek ? "configured" : null };
    res.json({ apiKeys: response });
  } catch (e) {
    console.error("API Keys Load Error:", e);
    res.status(500).json({ message: e.message || "Unable to load API keys" });
  }
});

router.post("/api/user/api-keys", validateSessionAndRole("Any"), async (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    if (!provider || typeof provider !== "string")
      return res.status(400).json({ message: "Provider is required" });

    const providerKey = provider.toLowerCase();
    if (providerKey !== "deepseek") {
      return res.status(400).json({ message: "Unknown provider" });
    }

    // Limit API key length to prevent abuse
    const trimmedApiKey = apiKey?.trim();
    if (trimmedApiKey && trimmedApiKey.length > 500) {
      return res.status(400).json({ message: "API key too long" });
    }

    await db.saveUserApiKey(req.session.user.username, providerKey, trimmedApiKey);
    res.json({ success: true });
  } catch (e) {
    console.error("API Keys Save Error:", e);
    res.status(500).json({ message: e.message || "Unable to save API key" });
  }
});

export default router;
