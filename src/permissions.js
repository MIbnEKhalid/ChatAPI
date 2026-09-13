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

const ROLES = {
  admin: {
    label: "ChatAPI Administrator",
    description: "Manage and monitor AI chat systems, users, and conversations",
    permissions: ["*"],
  },
  normaluser: {
    label: "Standard AI User",
    description: "Send chat messages, manage histories and personal API keys",
    permissions: ["chat:*", "history:*", "api_keys:*", "session:*"],
  },
};

export const Permissions = definePermissions(MANIFEST, { fallbackAppKey: "chatapi", roles: ROLES });

/** Register this app's permissions & roles in the catalog (idempotent, best-effort). */
export async function syncChatApiPermissions() {
  try {
    const result = await syncAppPermissions(Permissions, { fallbackAppKey: "chatapi" });
    console.log(`[chatapi] Permissions & roles synced (${result.synced} permissions, ${result.rolesSynced} roles)`);
    return result;
  } catch (err) {
    console.warn("[chatapi] Permission catalog sync skipped:", err?.message || err);
    return null;
  }
}

export default Permissions;

