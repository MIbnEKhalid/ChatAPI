import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { chatRepository } from "@/src/repositories/index.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requirePermission(request, Permissions.history.read);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").trim();
    const rows = await chatRepository.listUserChats(auth.user.username, { q: search });

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

    return Response.json(grouped);
  } catch (e) {
    console.error("History List Error:", e);
    return Response.json({ message: "Error loading list" }, { status: 500 });
  }
}
