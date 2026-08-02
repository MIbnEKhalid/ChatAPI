import express from "express";
import { pool } from "../config/database.js";
import { validateSessionAndRole } from "mbkauthe";
import { ChatTree } from "../models/chatTree.js";

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
  validateSessionAndRole("SuperAdmin"),
  async (req, res) => {
    try {
      const statsQuery = `SELECT (SELECT COUNT(*) FROM ai_history_chatapi) as total_chats, (SELECT COUNT(*) FROM ai_history_chatapi WHERE is_deleted = TRUE) as deleted_chats, (SELECT COUNT(DISTINCT username) FROM ai_history_chatapi) as unique_users`;
      const recentChatsQuery = `SELECT id, username, created_at, conversation_history, is_deleted FROM ai_history_chatapi ORDER BY created_at DESC LIMIT 10`;
      const hourlyVolumeQuery = `SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count FROM ai_history_chatapi WHERE created_at >= CURRENT_DATE GROUP BY hour ORDER BY hour`;

      const [statsRes, recentRes, hourlyRes] = await Promise.all([
        pool.query(statsQuery),
        pool.query(recentChatsQuery),
        pool.query(hourlyVolumeQuery),
      ]);

      const stats = statsRes.rows[0] || {};

      const recentChats = recentRes.rows.map((chat) => {
        let message_count = 0;
        try { message_count = chat.conversation_history ? countTreeNodes(chat.conversation_history) : 0; } catch (e) {}
        return { ...chat, message_count, created_at: new Date(chat.created_at).toLocaleString() };
      });

      const hourlyData = Array(24).fill(0);
      hourlyRes.rows.forEach((row) => { hourlyData[parseInt(row.hour, 10)] = parseInt(row.count, 10); });

      res.json({ stats, recentChats, hourlyData });
    } catch (error) {
      console.error("API Dashboard Error:", error);
      res.status(500).json({ message: "Server Error" });
    }
  }
);

// API: Users List
router.get(
  "/api/admin/users",
  validateSessionAndRole("SuperAdmin"),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const offset = (page - 1) * DEFAULT_PAGE_SIZE;
      const search = req.query.search || "";

      let whereClause = "";
      let params = [];
      if (search) { whereClause = "WHERE username ILIKE $1"; params.push(`%${search}%`); }

      const usersQuery = `SELECT username, COUNT(*) as total_chats, MAX(created_at) as last_active FROM ai_history_chatapi ${whereClause} GROUP BY username ORDER BY last_active DESC LIMIT ${DEFAULT_PAGE_SIZE} OFFSET ${offset}`;
      const countQuery = `SELECT COUNT(DISTINCT username) FROM ai_history_chatapi ${whereClause}`;

      const [usersRes, countRes] = await Promise.all([pool.query(usersQuery, params), pool.query(countQuery, params)]);
      const users = usersRes.rows.map((u) => ({ ...u, last_active: new Date(u.last_active).toLocaleString() }));
      const totalItems = parseInt(countRes.rows[0].count) || 0;
      const totalPages = Math.ceil(totalItems / DEFAULT_PAGE_SIZE) || 1;

      res.json({ users, pagination: { currentPage: page, totalPages, hasPrev: page > 1, hasNext: page < totalPages, prevPage: page - 1, nextPage: page + 1 } });
    } catch (error) {
      console.error("API Users Error:", error);
      res.status(500).json({ message: "Error loading users" });
    }
  }
);

// API: Chats List
router.get(
  "/api/admin/chats",
  validateSessionAndRole("SuperAdmin"),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const offset = (page - 1) * DEFAULT_PAGE_SIZE;
      const { username, status } = req.query;

      let conditions = [];
      let params = [];
      if (username) { conditions.push(`username ILIKE $${params.length + 1}`); params.push(`%${username}%`); }
      if (status === "deleted") conditions.push(`is_deleted = TRUE`);
      else if (status === "active") conditions.push(`is_deleted = FALSE`);

      const whereSQL = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
      const chatsQuery = `SELECT id, username, created_at, conversation_history, is_deleted FROM ai_history_chatapi ${whereSQL} ORDER BY created_at DESC LIMIT ${DEFAULT_PAGE_SIZE} OFFSET ${offset}`;
      const countQuery = `SELECT COUNT(*) FROM ai_history_chatapi ${whereSQL}`;

      const [chatsRes, countRes] = await Promise.all([pool.query(chatsQuery, params), pool.query(countQuery, params)]);
      const chats = chatsRes.rows.map((c) => ({ ...c, message_count: countTreeNodes(c.conversation_history), created_at: new Date(c.created_at).toLocaleString() }));
      const totalItems = parseInt(countRes.rows[0].count) || 0;
      const totalPages = Math.ceil(totalItems / DEFAULT_PAGE_SIZE) || 1;

      res.json({ chats, pagination: { currentPage: page, totalPages, hasPrev: page > 1, hasNext: page < totalPages, prevPage: page - 1, nextPage: page + 1 } });
    } catch (error) {
      console.error("API Chats Error:", error);
      res.status(500).json({ message: "Error loading chats" });
    }
  }
);

// API: Chat Detail
router.get(
  "/api/admin/chat-detail/:id",
  validateSessionAndRole("SuperAdmin"),
  async (req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM ai_history_chatapi WHERE id = $1", [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ message: "Not Found" });

      const chat = rows[0];
      let treeData = null;
      try {
        const history = typeof chat.conversation_history === "string" ? JSON.parse(chat.conversation_history) : chat.conversation_history;
        const tree = new ChatTree(history);
        treeData = tree.toJSON();
      } catch (e) {}

      res.json({ chat: { ...chat, created_at: new Date(chat.created_at).toLocaleString() }, treeData });
    } catch (error) {
      console.error("API Chat Detail Error:", error);
      res.status(500).json({ message: "Error loading chat detail" });
    }
  }
);

// Bulk Delete
router.post(
  "/api/admin/chats/bulk-delete",
  validateSessionAndRole("SuperAdmin"),
  async (req, res) => {
    try {
      const { chatIds, ids } = req.body;
      const deleteIds = chatIds || ids;
      if (!deleteIds || !deleteIds.length) return res.status(400).json({ success: false });
      await pool.query("UPDATE ai_history_chatapi SET is_deleted = TRUE WHERE id = ANY($1::int[])", [deleteIds]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

export default router;
