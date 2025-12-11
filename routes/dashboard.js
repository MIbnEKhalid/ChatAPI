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
    // 1. Stats Query: removed "Active Today" calculation
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM ai_history_chatapi) as total_chats,
        (SELECT COUNT(*) FROM ai_history_chatapi WHERE is_deleted = TRUE) as deleted_chats,
        (SELECT COUNT(DISTINCT username) FROM ai_history_chatapi) as unique_users
    `;
    
    // 2. Recent Chats: Strictly limited to latest 10
    const recentChatsQuery = `
      SELECT id, username, created_at, conversation_history, is_deleted
      FROM ai_history_chatapi
      ORDER BY created_at DESC
      LIMIT 10
    `;

    // 3. Hourly Volume for the Chart (Today only)
    const hourlyVolumeQuery = `
      SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
      FROM ai_history_chatapi
      WHERE created_at >= CURRENT_DATE
      GROUP BY hour ORDER BY hour
    `;

    // Execute all queries in parallel for performance
    const [statsRes, recentRes, hourlyRes] = await Promise.all([
      pool.query(statsQuery),
      pool.query(recentChatsQuery),
      pool.query(hourlyVolumeQuery)
    ]);

    const stats = statsRes.rows[0];

    // Process recent chats
    const recentChats = recentRes.rows.map(chat => ({
        ...chat,
        // Safety check: ensure history exists before counting
        message_count: chat.conversation_history ? countTreeNodes(chat.conversation_history) : 0,
        created_at: new Date(chat.created_at).toLocaleString()
    }));

    // Process hourly data for the chart (0-23 hours)
    const hourlyData = Array(24).fill(0);
    hourlyRes.rows.forEach(row => {
        hourlyData[parseInt(row.hour)] = parseInt(row.count);
    });

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
    const DEFAULT_PAGE_SIZE = 20;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * DEFAULT_PAGE_SIZE;
    const search = req.query.search || "";

    // Dynamic Query Construction
    let whereClause = "";
    let params = [];
    
    // If searching, add filter
    if (search) {
      whereClause = "WHERE username ILIKE $1";
      params.push(`%${search}%`);
    }

    // Main Data Query
    // Note: We use string interpolation for LIMIT/OFFSET as they are trusted integers here
    const usersQuery = `
      SELECT username, COUNT(*) as total_chats, MAX(created_at) as last_active
      FROM ai_history_chatapi
      ${whereClause}
      GROUP BY username
      ORDER BY last_active DESC
      LIMIT ${DEFAULT_PAGE_SIZE} OFFSET ${offset}
    `;

    // Count Query for Pagination
    const countQuery = `SELECT COUNT(DISTINCT username) FROM ai_history_chatapi ${whereClause}`;

    // Execute queries
    const [usersRes, countRes] = await Promise.all([
      pool.query(usersQuery, params),
      pool.query(countQuery, params)
    ]);

    // Format Dates
    const users = usersRes.rows.map(u => ({ 
        ...u, 
        last_active: new Date(u.last_active).toLocaleString() 
    }));

    const totalItems = parseInt(countRes.rows[0].count) || 0;
    const totalPages = Math.ceil(totalItems / DEFAULT_PAGE_SIZE) || 1;

    res.render("admin/users.handlebars", {
      layout: false,
      users,
      searchQuery: search,
      currentUser: req.session.user.username,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
        prevPage: page - 1,
        nextPage: page + 1
      }
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
    
    // Extract filters
    const { username, status } = req.query; // status can be 'all', 'active', 'deleted'

    let conditions = [];
    let params = [];
    
    // 1. Username Filter
    if (username) {
        conditions.push(`username ILIKE $${params.length + 1}`);
        params.push(`%${username}%`);
    }

    // 2. Status Filter (New)
    if (status === 'deleted') {
        conditions.push(`is_deleted = TRUE`);
    } else if (status === 'active') {
        conditions.push(`is_deleted = FALSE`);
    }
    // If status is 'all' or undefined, we don't add a condition, so it returns both.
    
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
        // Pass filters back to view to keep inputs filled
        filters: {
            username: username || "",
            status: status || "all"
        },
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