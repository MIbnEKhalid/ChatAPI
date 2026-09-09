import { sendError } from "mbkauthe";
import { ChatTree } from "../models/chat-tree.js";
import aiServices from "../services/ai.service.js";
import { chatRepository } from "../repositories/index.js";
import { AI_PROVIDER, DEEPSEEK_MODELS } from "../config/ai.js";

// Load Chat API (Returns Full Tree) — ownership-checked
export async function getChatHistory(req, res) {
  try {
    const chat = await chatRepository.getChat(req.params.chatId, req.session.user.username);
    if (!chat) return sendError(res, "Not found", { statusCode: 404, code: "CHAT_NOT_FOUND" });

    // Parse tree
    let history =
      typeof chat.conversation_history === "string"
        ? JSON.parse(chat.conversation_history)
        : chat.conversation_history;
    const tree = new ChatTree(history);

    res.json({ ...chat, treeData: tree.toJSON() });
  } catch (error) {
    console.error("Load Chat Error:", error);
    return sendError(res, "Error loading chat history", { statusCode: 500, details: error.message });
  }
}

// Main Chat Processing Route
export async function processChat(req, res) {
  const { message, chatId, parentMessageId, model: modelStr, temperature: tempParam } = req.body;
  const { username } = req.session.user;

  // Validate and sanitize input
  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) return sendError(res, "Empty message", { statusCode: 400, code: "EMPTY_MESSAGE" });
  if (trimmedMessage.length > 10000) return sendError(res, "Message too long (max 10,000 characters)", { statusCode: 400, code: "MESSAGE_TOO_LONG" });

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
      const chat = await chatRepository.getChat(dbId);
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
    //  tree.addMessage("system", "You are a helpful AI assistant. Be concise.", null);
    }

    // 2. Add User Node
    // If parentMessageId exists (Editing/Branching), use it. Else use current leaf.
    const parentId = parentMessageId || tree.currentLeafId;
    const userNodeId = tree.addMessage("user", trimmedMessage, parentId);

    // 3. Get Context for AI (Linear History from User Node up to Root)
    const historyForAI = tree.getThread(userNodeId);

    // 4. Generate AI Response
    const userApiKeys = await chatRepository.getUserApiKeys(username);
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
    // Auto-generate title from first user message if this is a new chat
    const autoTitle = !dbId ? trimmedMessage.slice(0, 80) : null;
    const newChatId = await chatRepository.saveChat(dbId, tree.toJSON(), username, autoTitle);

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
}

// Streaming Chat Route — SSE real-time response
export async function streamChat(req, res) {
  const { message, chatId, parentMessageId, model: modelStr, temperature: tempParam } = req.body;
  const { username } = req.session.user;

  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) return res.status(400).json({ message: "Empty message" });

  // Setup SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders(); // send headers immediately, no buffering

  try {
    const temp = parseFloat(tempParam) || 0.7;
    let modelName = (modelStr || "deepseek/deepseek-v4-flash").split("/").pop();
    if (!DEEPSEEK_MODELS.has(modelName)) modelName = "deepseek-v4-flash";

    // Load or init tree
    let tree, dbId = chatId;
    if (dbId) {
      const chat = await chatRepository.getChat(dbId);
      if (chat) {
        const raw = typeof chat.conversation_history === "string" ? JSON.parse(chat.conversation_history) : chat.conversation_history;
        tree = new ChatTree(raw);
      } else {
        tree = new ChatTree(null);
        dbId = null;
      }
    } else {
      tree = new ChatTree(null);
    }

    // Add user node
    const parentId = parentMessageId || tree.currentLeafId;
    const userNodeId = tree.addMessage("user", trimmedMessage, parentId);
    const historyForAI = tree.getThread(userNodeId);

    // API config
    const userApiKeys = await chatRepository.getUserApiKeys(username);
    const requestConfig = { ...AI_PROVIDER, apiKey: userApiKeys.deepseek || AI_PROVIDER.apiKey };
    if (!requestConfig.apiKey) {
      res.write(`data: ${JSON.stringify({ type: "error", message: "No DeepSeek API token configured." })}\n\n`);
      return res.end();
    }

    // Stream AI response
    let fullResponse = "";
    for await (const delta of aiServices.openaiCompatibleStream(requestConfig, modelName, historyForAI, temp)) {
      fullResponse += delta;
      res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
    }

    // Save to tree + DB
    tree.addMessage("model", fullResponse, userNodeId);
    const autoTitle = !dbId ? trimmedMessage.slice(0, 80) : null;
    const newChatId = await chatRepository.saveChat(dbId, tree.toJSON(), username, autoTitle);

    // Send final done event
    res.write(`data: ${JSON.stringify({
      type: "done",
      newChatId,
      treeData: tree.toJSON(),
    })}\n\n`);
    res.end();
  } catch (error) {
    console.error("Stream Error:", error);
    res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
    res.end();
  }
}

// Soft Delete (Set is_deleted = TRUE) — ownership-checked
export async function clearChatHistory(req, res) {
  try {
    const ok = await chatRepository.softDeleteChat(req.params.chatId, req.session.user.username);
    if (!ok) {
      return res.status(403).json({ success: false, message: "Not authorized or not found" });
    }
    res.json({ success: true, message: "Chat moved to trash" });
  } catch (e) {
    console.error("Clear Chat Error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
}

// Fetch List (Filter is_deleted = FALSE) — supports ?search= query
export async function listChatHistories(req, res) {
  try {
    const search = (req.query.search || '').trim();
    const rows = await chatRepository.listUserChats(req.session.user.username, { q: search });

    // Grouping — pinned items first, then by date
    const grouped = { pinned: [], today: [], yesterday: [], older: [] };
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setDate(todayDate.getDate() - 1);

    rows.forEach((r) => {
      const d = new Date(r.created_at);
      const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

      const obj = {
        id: r.id,
        title: r.title || null,
        is_pinned: r.is_pinned || false,
        created_at: d.toLocaleDateString(),
      };

      if (r.is_pinned) {
        grouped.pinned.push(obj);
      } else if (dDate.getTime() === todayDate.getTime()) {
        grouped.today.push(obj);
      } else if (dDate.getTime() === yesterdayDate.getTime()) {
        grouped.yesterday.push(obj);
      } else {
        grouped.older.push(obj);
      }
    });

    res.json(grouped);
  } catch (e) {
    console.error("History List Error:", e);
    res.status(500).json({ message: "Error loading list" });
  }
}

// PATCH: Rename or toggle pin on a chat
export async function updateChatHistory(req, res) {
  try {
    const { action, title } = req.body;
    const { chatId } = req.params;
    const { username } = req.session.user;

    if (action === 'rename') {
      const newTitle = String(title || '').trim().slice(0, 200);
      if (!newTitle) return res.status(400).json({ message: "Title is required" });
      const ok = await chatRepository.renameChat(chatId, newTitle, username);
      if (!ok) return res.status(404).json({ message: "Not found" });
      return res.json({ success: true, title: newTitle });
    }

    if (action === 'pin') {
      const pinned = await chatRepository.togglePin(chatId, username);
      if (pinned === null) return res.status(404).json({ message: "Not found" });
      return res.json({ success: true, is_pinned: pinned });
    }

    res.status(400).json({ message: "Invalid action. Use 'rename' or 'pin'." });
  } catch (e) {
    console.error("Chat Update Error:", e);
    res.status(500).json({ message: e.message });
  }
}

export async function getUserApiKeys(req, res) {
  try {
    const apiKeys = await chatRepository.getUserApiKeys(req.session.user.username);
    const response = { deepseek: apiKeys.deepseek ? "configured" : null };
    res.json({ apiKeys: response });
  } catch (e) {
    console.error("API Keys Load Error:", e);
    res.status(500).json({ message: e.message || "Unable to load API keys" });
  }
}

export async function saveUserApiKey(req, res) {
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

    await chatRepository.saveUserApiKey(req.session.user.username, providerKey, trimmedApiKey);
    res.json({ success: true });
  } catch (e) {
    console.error("API Keys Save Error:", e);
    res.status(500).json({ message: e.message || "Unable to save API key" });
  }
}

// User Session Info (for React SPA)
export async function getUserSession(req, res) {
  try {
    const limits = await chatRepository.getLimits(req.session.user.username);
    res.json({
      username: req.session.user.username,
      role: req.session.user.role,
      limits,
    });
  } catch (e) {
    console.error("Session Error:", e);
    res.status(500).json({ message: "Session error" });
  }
}
