import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { chatRepository } from "@/src/repositories/index.js";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;

const countTreeNodes = (history) => {
  if (!history) return 0;
  const data = typeof history === "string" ? JSON.parse(history) : history;
  return data.nodes
    ? Object.keys(data.nodes).length
    : Array.isArray(data)
    ? data.length
    : 0;
};

export async function GET(request) {
  const auth = await requirePermission(request, Permissions.admin.view_chat);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page"), 10) || 1;
    const username = url.searchParams.get("username") || undefined;
    const status = url.searchParams.get("status") || undefined;

    const { chats: rawChats, totalItems, totalPages } = await chatRepository.getAdminChats({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      username,
      status,
    });

    const chats = rawChats.map((c) => ({
      ...c,
      message_count: countTreeNodes(c.conversation_history),
      created_at: new Date(c.created_at).toLocaleString(),
    }));

    return Response.json({
      chats,
      pagination: {
        currentPage: page,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
        prevPage: page - 1,
        nextPage: page + 1,
      },
    });
  } catch (error) {
    console.error("API Chats Error:", error);
    return Response.json(
      { error: "ADMIN_CHATS_ERROR", message: error.message },
      { status: 500 }
    );
  }
}
