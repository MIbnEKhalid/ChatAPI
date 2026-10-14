import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { chatRepository } from "@/src/repositories/index.js";
import { ChatTree } from "@/src/models/chat-tree.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = await requirePermission(request, Permissions.admin.view_chat);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const chat = await chatRepository.getAdminChatDetail(id);
    if (!chat) {
      return Response.json(
        { error: "Not Found", code: "CHAT_NOT_FOUND" },
        { status: 404 }
      );
    }

    let treeData = null;
    try {
      const history =
        typeof chat.conversation_history === "string"
          ? JSON.parse(chat.conversation_history)
          : chat.conversation_history;
      const tree = new ChatTree(history);
      treeData = tree.toJSON();
    } catch {}

    return Response.json({
      chat: { ...chat, created_at: new Date(chat.created_at).toLocaleString() },
      treeData,
    });
  } catch (error) {
    console.error("API Chat Detail Error:", error);
    return Response.json(
      { error: "ADMIN_CHAT_DETAIL_ERROR", message: error.message },
      { status: 500 }
    );
  }
}
