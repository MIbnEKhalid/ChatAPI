import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { chatRepository } from "@/src/repositories/index.js";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;

export async function GET(request) {
  const auth = await requirePermission(request, Permissions.admin.list_users);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page"), 10) || 1;
    const search = url.searchParams.get("search") || "";

    const { users: rawUsers, totalItems, totalPages } = await chatRepository.getAdminUsers({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      search,
    });

    const users = rawUsers.map((u) => ({
      ...u,
      last_active: new Date(u.last_active).toLocaleString(),
    }));

    return Response.json({
      users,
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
    console.error("API Users Error:", error);
    return Response.json(
      { error: "ADMIN_USERS_ERROR", message: error.message },
      { status: 500 }
    );
  }
}
