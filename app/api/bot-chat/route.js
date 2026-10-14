import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { checkMessageLimitNext } from "@/src/lib/messageLimit.js";
import { ChatTree } from "@/src/models/chat-tree.js";
import aiServices from "@/src/services/ai.service.js";
import { chatRepository } from "@/src/repositories/index.js";
import { DEEPSEEK_CONFIG, GEMINI_CONFIG, getModelProvider } from "@/src/config/ai.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await requirePermission(request, Permissions.chat.send);
  if (auth.errorResponse) return auth.errorResponse;

  const body = await request.json().catch(() => ({}));
  const { message, chatId, parentMessageId, model: modelStr, temperature: tempParam } = body;
  const { username } = auth.user;

  // Validate and sanitize input
  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) {
    return Response.json({ message: "Empty message", code: "EMPTY_MESSAGE" }, { status: 400 });
  }
  if (trimmedMessage.length > 10000) {
    return Response.json(
      { message: "Message too long (max 10,000 characters)", code: "MESSAGE_TOO_LONG" },
      { status: 400 }
    );
  }

  // Check quota limit
  const limitCheck = await checkMessageLimitNext(request, auth.user);
  if (!limitCheck.allowed) {
    return limitCheck.errorResponse;
  }

  try {
    const temp = parseFloat(tempParam) || 0.7;
    const { provider, modelName } = getModelProvider(modelStr);

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
        tree = new ChatTree(null);
        dbId = null;
      }
    } else {
      tree = new ChatTree(null);
    }

    // 2. Add User Node
    const parentId = parentMessageId || tree.currentLeafId;
    const userNodeId = tree.addMessage("user", trimmedMessage, parentId);

    // 3. Get Context for AI
    const historyForAI = tree.getThread(userNodeId);

    // 4. Generate AI Response
    const userApiKeys = await chatRepository.getUserApiKeys(username);
    let responseText;

    if (provider === "gemini") {
      const userApiKey = userApiKeys.gemini;
      const requestConfig = { ...GEMINI_CONFIG, apiKey: userApiKey || GEMINI_CONFIG.apiKey };

      if (!requestConfig.apiKey) {
        return Response.json(
          {
            message:
              "No Google Gemini API key configured. Add your key in Settings or set GEMINI_API_KEY in environment variables.",
          },
          { status: 400 }
        );
      }

      responseText = await aiServices.gemini(requestConfig, modelName, historyForAI, temp);
    } else {
      const userApiKey = userApiKeys.deepseek;
      const requestConfig = { ...DEEPSEEK_CONFIG, apiKey: userApiKey || DEEPSEEK_CONFIG.apiKey };

      if (!requestConfig.apiKey) {
        return Response.json(
          {
            message:
              "No DeepSeek API token configured. Add a valid token in your account settings or set DEEPSEEK_API_TOKEN in environment variables.",
          },
          { status: 400 }
        );
      }

      responseText = await aiServices.openaiCompatible(
        requestConfig,
        modelName,
        historyForAI,
        temp
      );
    }

    // 5. Add AI Node
    tree.addMessage("model", responseText, userNodeId);

    // 6. Save to DB
    const autoTitle = !dbId ? trimmedMessage.slice(0, 80) : null;
    const newChatId = await chatRepository.saveChat(dbId, tree.toJSON(), username, autoTitle);

    return Response.json({
      aiResponse: responseText,
      newChatId,
      treeData: tree.toJSON(),
    });
  } catch (error) {
    console.error("Chat Error:", error);
    const status = error.message && error.message.includes("429") ? 429 : 500;
    return Response.json({ message: error.message }, { status });
  }
}
