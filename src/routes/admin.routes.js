import express from "express";
import { validateSessionAndRole, sendSuccess, sendError } from "mbkauthe";
import { chatRepository } from "../repositories/index.js";
import { ChatTree } from "../models/chat-tree.js";

const router = express.Router();

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

// ===== JSON API ENDPOINTS FOR REACT FRONTEND =====

// API: Dashboard Stats
router.get(
  "/api/admin/stats",
  validateSessionAndRole("superadmin"),
  async (req, res) => {
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

      res.json({ stats, recentChats, hourlyData });
    } catch (error) {
      console.error("API Dashboard Error:", error);
      sendError(res, error, { statusCode: 500, code: "ADMIN_STATS_ERROR" });
    }
  }
);

// API: Users List
router.get(
  "/api/admin/users",
  validateSessionAndRole("superadmin"),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const search = req.query.search || "";

      const { users: rawUsers, totalItems, totalPages } = await chatRepository.getAdminUsers({
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        search,
      });

      const users = rawUsers.map((u) => ({
        ...u,
        last_active: new Date(u.last_active).toLocaleString(),
      }));

      res.json({
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
      sendError(res, error, { statusCode: 500, code: "ADMIN_USERS_ERROR" });
    }
  }
);

// API: Chats List
router.get(
  "/api/admin/chats",
  validateSessionAndRole("superadmin"),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const { username, status } = req.query;

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

      res.json({
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
      sendError(res, error, { statusCode: 500, code: "ADMIN_CHATS_ERROR" });
    }
  }
);

// API: Chat Detail
router.get(
  "/api/admin/chat-detail/:id",
  validateSessionAndRole("superadmin"),
  async (req, res) => {
    try {
      const chat = await chatRepository.getAdminChatDetail(req.params.id);
      if (!chat) return sendError(res, "Not Found", { statusCode: 404, code: "CHAT_NOT_FOUND" });

      let treeData = null;
      try {
        const history =
          typeof chat.conversation_history === "string"
            ? JSON.parse(chat.conversation_history)
            : chat.conversation_history;
        const tree = new ChatTree(history);
        treeData = tree.toJSON();
      } catch {}

      res.json({
        chat: { ...chat, created_at: new Date(chat.created_at).toLocaleString() },
        treeData,
      });
    } catch (error) {
      console.error("API Chat Detail Error:", error);
      sendError(res, error, { statusCode: 500, code: "ADMIN_CHAT_DETAIL_ERROR" });
    }
  }
);

// Bulk Delete
router.post(
  "/api/admin/chats/bulk-delete",
  validateSessionAndRole("superadmin"),
  async (req, res) => {
    try {
      const { chatIds, ids } = req.body;
      const deleteIds = chatIds || ids;
      if (!deleteIds || !deleteIds.length) {
        return sendError(res, "No chat IDs provided for deletion", { statusCode: 400, code: "INVALID_REQUEST" });
      }

      await chatRepository.bulkDeleteChats(deleteIds);
      sendSuccess(res, { success: true });
    } catch (error) {
      sendError(res, error, { statusCode: 500, code: "BULK_DELETE_ERROR" });
    }
  }
);

export default router;
