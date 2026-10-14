import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { checkMessageLimitNext } from "@/src/lib/messageLimit.js";
import { ChatTree } from "@/src/models/chat-tree.js";
import aiServices from "@/src/services/ai.service.js";
import { chatRepository } from "@/src/repositories/index.js";
import { DEEPSEEK_CONFIG, GEMINI_CONFIG, getModelProvider } from "@/src/config/ai.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await requirePermission(request, Permissions.chat.stream);
  if (auth.errorResponse) return auth.errorResponse;

  const body = await request.json().catch(() => ({}));
  const { message, chatId, parentMessageId, model: modelStr, temperature: tempParam } = body;
  const { username } = auth.user;

  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) {
    return Response.json({ message: "Empty message" }, { status: 400 });
  }

  // Quota check
  const limitCheck = await checkMessageLimitNext(request, auth.user);
  if (!limitCheck.allowed) {
    return limitCheck.errorResponse;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const temp = parseFloat(tempParam) || 0.7;
        const { provider, modelName } = getModelProvider(modelStr);

        // Load or init tree
        let tree;
        let dbId = chatId;
        if (dbId) {
          const chat = await chatRepository.getChat(dbId);
          if (chat) {
            const raw =
              typeof chat.conversation_history === "string"
                ? JSON.parse(chat.conversation_history)
                : chat.conversation_history;
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
        let streamIterator;

        if (provider === "gemini") {
          const userApiKey = userApiKeys.gemini;
          const requestConfig = { ...GEMINI_CONFIG, apiKey: userApiKey || GEMINI_CONFIG.apiKey };
          if (!requestConfig.apiKey) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message:
                    "No Google Gemini API key configured. Add your key in Settings or set GEMINI_API_KEY.",
                })}\n\n`
              )
            );
            controller.close();
            return;
          }
          streamIterator = aiServices.geminiStream(requestConfig, modelName, historyForAI, temp);
        } else {
          const userApiKey = userApiKeys.deepseek;
          const requestConfig = { ...DEEPSEEK_CONFIG, apiKey: userApiKey || DEEPSEEK_CONFIG.apiKey };
          if (!requestConfig.apiKey) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message:
                    "No DeepSeek API token configured. Add a token in Settings or set DEEPSEEK_API_TOKEN.",
                })}\n\n`
              )
            );
            controller.close();
            return;
          }
          streamIterator = aiServices.openaiCompatibleStream(
            requestConfig,
            modelName,
            historyForAI,
            temp
          );
        }

        // Stream AI response chunks
        let fullResponse = "";
        for await (const delta of streamIterator) {
          fullResponse += delta;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`)
          );
        }

        // Save to tree + DB
        tree.addMessage("model", fullResponse, userNodeId);
        const autoTitle = !dbId ? trimmedMessage.slice(0, 80) : null;
        const newChatId = await chatRepository.saveChat(dbId, tree.toJSON(), username, autoTitle);

        // Send final done event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              newChatId,
              treeData: tree.toJSON(),
            })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        console.error("Stream Error:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
