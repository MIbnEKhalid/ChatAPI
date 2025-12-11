import express from "express";
import dotenv from "dotenv";
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";

dotenv.config();
const router = express.Router();

const DEFAULT_PAGE_SIZE = 20;

const countTreeNodes = (history) => {
    if (!history) return 0;
    const data = typeof history === 'string' ? JSON.parse(history) : history;
    return data.nodes ? Object.keys(data.nodes).length : (Array.isArray(data) ? data.length : 0);
};

// 1. ADMIN DASHBOARD
router.get("/admin/dashboard", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM ai_history_chatapi) as total_chats,
        (SELECT COUNT(*) FROM ai_history_chatapi WHERE is_deleted = TRUE) as deleted_chats,
        (SELECT COUNT(DISTINCT username) FROM ai_history_chatapi) as unique_users
    `;
    
    const recentChatsQuery = `
      SELECT id, username, created_at, conversation_history, is_deleted
      FROM ai_history_chatapi
      ORDER BY created_at DESC
      LIMIT 10
    `;

    const hourlyVolumeQuery = `
      SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
      FROM ai_history_chatapi
      WHERE created_at >= CURRENT_DATE
      GROUP BY hour ORDER BY hour
    `;

    const [statsRes, recentRes, hourlyRes] = await Promise.all([
      pool.query(statsQuery),
      pool.query(recentChatsQuery),
      pool.query(hourlyVolumeQuery)
    ]);

    const stats = statsRes.rows[0];
    const recentChats = recentRes.rows.map(chat => ({
        ...chat,
        message_count: countTreeNodes(chat.conversation_history),
        created_at: new Date(chat.created_at).toLocaleString()
    }));

    const hourlyData = Array(24).fill(0);
    hourlyRes.rows.forEach(row => hourlyData[parseInt(row.hour)] = parseInt(row.count));

    res.render("admin/dashboard.handlebars", {
      layout: false,
      stats,
      recentChats,
      hourlyData: JSON.stringify(hourlyData),
      currentUser: req.session.user.username
    });

  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).send("Server Error");
  }
});

// 2. USER MANAGEMENT
router.get("/admin/users", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * DEFAULT_PAGE_SIZE;
    const search = req.query.search || "";

    let whereClause = "";
    let params = [];
    if (search) {
      whereClause = "WHERE username ILIKE $1";
      params.push(`%${search}%`);
    }

    const usersQuery = `
      SELECT username, COUNT(*) as total_chats, MAX(created_at) as last_active
      FROM ai_history_chatapi
      ${whereClause}
      GROUP BY username
      ORDER BY last_active DESC
      LIMIT ${DEFAULT_PAGE_SIZE} OFFSET ${offset}
    `;

    const countQuery = `SELECT COUNT(DISTINCT username) FROM ai_history_chatapi ${whereClause}`;

    const [usersRes, countRes] = await Promise.all([
      pool.query(usersQuery, params),
      pool.query(countQuery, params)
    ]);

    const users = usersRes.rows.map(u => ({ ...u, last_active: new Date(u.last_active).toLocaleString() }));

    res.render("admin/users.handlebars", {
      layout: false,
      users,
      searchQuery: search,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(parseInt(countRes.rows[0].count) / DEFAULT_PAGE_SIZE) || 1
      },
      currentUser: req.session.user.username
    });

  } catch (error) {
    console.error("Users Error:", error);
    res.status(500).send("Error loading users");
  }
});

// 3. CHAT MANAGEMENT (Shows Deleted Too)
router.get("/admin/chats", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * DEFAULT_PAGE_SIZE;
    const { username } = req.query;

    let conditions = [];
    let params = [];
    
    if (username) {
        conditions.push(`username ILIKE $${params.length + 1}`);
        params.push(`%${username}%`);
    }
    
    const whereSQL = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const chatsQuery = `
      SELECT id, username, created_at, conversation_history, is_deleted
      FROM ai_history_chatapi
      ${whereSQL}
      ORDER BY created_at DESC
      LIMIT ${DEFAULT_PAGE_SIZE} OFFSET ${offset}
    `;

    const countQuery = `SELECT COUNT(*) FROM ai_history_chatapi ${whereSQL}`;

    const [chatsRes, countRes] = await Promise.all([
        pool.query(chatsQuery, params),
        pool.query(countQuery, params)
    ]);

    const chats = chatsRes.rows.map(c => ({
        ...c,
        message_count: countTreeNodes(c.conversation_history),
        created_at: new Date(c.created_at).toLocaleString()
    }));

    res.render("admin/chats.handlebars", {
        layout: false,
        chats,
        usernameFilter: username,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(parseInt(countRes.rows[0].count) / DEFAULT_PAGE_SIZE) || 1
        },
        currentUser: req.session.user.username
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading chats");
  }
});

// 4. CHAT DETAIL INSPECTOR
router.get("/admin/chats/:id", validateSessionAndRole("SuperAdmin"), async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM ai_history_chatapi WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).send("Not Found");
        
        const chat = rows[0];
        const historyJson = typeof chat.conversation_history === 'string' 
            ? chat.conversation_history 
            : JSON.stringify(chat.conversation_history);

        res.render("admin/chat-detail.handlebars", {
            layout: false,
            chat: { ...chat, created_at: new Date(chat.created_at).toLocaleString() },
            historyJson, 
            currentUser: req.session.user.username
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Error loading chat detail");
    }
});

// 5. BULK DELETE
router.post("/admin/chats/bulk-delete", validateSessionAndRole("SuperAdmin"), async (req, res) => {
    try {
        const { chatIds } = req.body;
        if (!chatIds || !chatIds.length) return res.status(400).json({success: false});
        await pool.query("UPDATE ai_history_chatapi SET is_deleted = TRUE WHERE id = ANY($1::int[])", [chatIds]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;