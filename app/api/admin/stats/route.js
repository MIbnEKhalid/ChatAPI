import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { chatRepository } from "@/src/repositories/index.js";

export const dynamic = "force-dynamic";

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
  const auth = await requirePermission(request, Permissions.admin.stats);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { stats, recentChats: rawRecent, hourlyRows } = await chatRepository.getAdminStats();

    const recentChats = rawRecent.map((chat) => {
      let message_count = 0;
      try {
        message_count = chat.conversation_history ? countTreeNodes(chat.conversation_history) : 0;
      } catch {}
      return { ...chat, message_count, created_at: new Date(chat.created_at).toLocaleString() };
    });

    const hourlyData = Array(24).fill(0);
    hourlyRows.forEach((row) => {
      hourlyData[parseInt(row.hour, 10)] = parseInt(row.count, 10);
    });

    return Response.json({ stats, recentChats, hourlyData });
  } catch (error) {
    console.error("API Dashboard Error:", error);
    return Response.json(
      { error: "ADMIN_STATS_ERROR", message: error.message },
      { status: 500 }
    );
  }
}
