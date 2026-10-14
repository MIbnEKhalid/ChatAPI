import { requirePermission } from "@/src/lib/auth.js";
import { Permissions } from "@/src/permissions.js";
import { chatRepository } from "@/src/repositories/index.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requirePermission(request, Permissions.api_keys.manage);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const apiKeys = await chatRepository.getUserApiKeys(auth.user.username);
    return Response.json({
      apiKeys: {
        deepseek: apiKeys.deepseek ? "configured" : null,
        gemini: apiKeys.gemini ? "configured" : null,
      },
    });
  } catch (e) {
    console.error("API Keys Load Error:", e);
    return Response.json({ message: e.message || "Unable to load API keys" }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requirePermission(request, Permissions.api_keys.manage);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const { provider, apiKey } = body;

    if (!provider || typeof provider !== "string") {
      return Response.json({ message: "Provider is required" }, { status: 400 });
    }

    const providerKey = provider.toLowerCase();
    if (providerKey !== "deepseek" && providerKey !== "gemini") {
      return Response.json(
        { message: "Unknown provider (supported: deepseek, gemini)" },
        { status: 400 }
      );
    }

    const trimmedApiKey = apiKey?.trim();
    if (trimmedApiKey && trimmedApiKey.length > 500) {
      return Response.json({ message: "API key too long" }, { status: 400 });
    }

    await chatRepository.saveUserApiKey(auth.user.username, providerKey, trimmedApiKey);
    return Response.json({ success: true });
  } catch (e) {
    console.error("API Keys Save Error:", e);
    return Response.json({ message: e.message || "Unable to save API key" }, { status: 500 });
  }
}
