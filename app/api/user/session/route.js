import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { chatRepository } from "@/src/repositories/index.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requirePermission(request, Permissions.session.read);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const limits = await chatRepository.getLimits(auth.user.username);
    return Response.json({
      username: auth.user.username,
      role: auth.user.role,
      limits,
    });
  } catch (e) {
    console.error("Session Error:", e);
    return Response.json({ message: "Session error" }, { status: 500 });
  }
}
