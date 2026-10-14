import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { chatRepository } from "@/src/repositories/index.js";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const { chatId } = await params;
  const auth = await requirePermission(request, Permissions.history.clear);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const ok = await chatRepository.softDeleteChat(chatId, auth.user.username);
    if (!ok) {
      return Response.json(
        { success: false, message: "Not authorized or not found" },
        { status: 403 }
      );
    }
    return Response.json({ success: true, message: "Chat moved to trash" });
  } catch (e) {
    console.error("Clear Chat Error:", e);
    return Response.json({ success: false, message: e.message }, { status: 500 });
  }
}
