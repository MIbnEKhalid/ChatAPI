import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { chatRepository } from "@/src/repositories/index.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await requirePermission(request, Permissions.admin.delete_chats);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const { chatIds, ids } = body;
    const deleteIds = chatIds || ids;

    if (!deleteIds || !deleteIds.length) {
      return Response.json(
        { error: "INVALID_REQUEST", message: "No chat IDs provided for deletion" },
        { status: 400 }
      );
    }

    await chatRepository.bulkDeleteChats(deleteIds);
    return Response.json({ success: true });
  } catch (error) {
    console.error("API Bulk Delete Error:", error);
    return Response.json(
      { error: "BULK_DELETE_ERROR", message: error.message },
      { status: 500 }
    );
  }
}
