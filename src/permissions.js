/**
 * ChatAPI — permission manifest.
 *
 * Declares the AI chat API's permission surface. App key resolution,
 * permission prefixing and catalog sync are handled by mbkauthe's helpers
 * (`definePermissions` / `syncAppPermissions`).
 *
 * Feature → route mapping:
 *   chat     -> POST /api/bot-chat[/stream] (send / stream AI chat)
 *   history  -> /api/chat/histories*        (read / clear / rename / delete)
 *   api_keys -> /api/user/api-keys
 *   session  -> /api/user/session
 *   admin    -> /api/admin/*                (stats / users / chats / bulk-delete)
 */
import { definePermissions, syncAppPermissions } from "mbkauthe";

const MANIFEST = {
  chat: {
    send: "Send AI chat messages",
    stream: "Stream AI chat responses",
  },
  history: {
    read: "Read chat histories",
    clear: "Clear chat history",
    rename: "Rename chat histories",
    delete: "Delete chat histories",
  },
  api_keys: {
    manage: "Manage personal API keys",
  },
  session: {
    read: "Read own session info",
  },
  admin: {
    stats: "View admin statistics",
    list_users: "List users",
    view_chat: "View any chat detail",
    delete_chats: "Bulk delete chats",
  },
};

export const Permissions = definePermissions(MANIFEST, { fallbackAppKey: "chatapi" });

/** Register this app's permissions in the catalog (idempotent, best-effort). */
export async function syncChatApiPermissions() {
  try {
    const result = await syncAppPermissions(Permissions, { fallbackAppKey: "chatapi" });
    console.log(`[chatapi] Permission catalog synced (${result.synced} permissions)`);
    return result;
  } catch (err) {
    console.warn("[chatapi] Permission catalog sync skipped:", err?.message || err);
    return null;
  }
}

export default Permissions;
