import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { chatRepository } from "@/src/repositories/index.js";
import { ChatTree } from "@/src/models/chat-tree.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { chatId } = await params;
  const auth = await requirePermission(request, Permissions.history.read);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const chat = await chatRepository.getChat(chatId, auth.user.username);
    if (!chat) {
      return Response.json(
        { error: "Not found", code: "CHAT_NOT_FOUND" },
        { status: 404 }
      );
    }

    let history =
      typeof chat.conversation_history === "string"
        ? JSON.parse(chat.conversation_history)
        : chat.conversation_history;
    const tree = new ChatTree(history);

    return Response.json({ ...chat, treeData: tree.toJSON() });
  } catch (error) {
    console.error("Load Chat Error:", error);
    return Response.json(
      { error: "Error loading chat history", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  const { chatId } = await params;
  const auth = await requirePermission(request, Permissions.history.rename);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const { action, title } = body;
    const { username } = auth.user;

    if (action === "rename") {
      const newTitle = String(title || "").trim().slice(0, 200);
      if (!newTitle) return Response.json({ message: "Title is required" }, { status: 400 });
      const ok = await chatRepository.renameChat(chatId, newTitle, username);
      if (!ok) return Response.json({ message: "Not found" }, { status: 404 });
      return Response.json({ success: true, title: newTitle });
    }

    if (action === "pin") {
      const pinned = await chatRepository.togglePin(chatId, username);
      if (pinned === null) return Response.json({ message: "Not found" }, { status: 404 });
      return Response.json({ success: true, is_pinned: pinned });
    }

    return Response.json({ message: "Invalid action. Use 'rename' or 'pin'." }, { status: 400 });
  } catch (e) {
    console.error("Chat Update Error:", e);
    return Response.json({ message: e.message }, { status: 500 });
  }
}
