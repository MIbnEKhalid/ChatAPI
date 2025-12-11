import express from "express";
import dotenv from "dotenv";
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";

dotenv.config();
const router = express.Router();

const DEFAULT_PAGE_SIZE = 20;

// --- UTILITY FOR TREE PARSING ---
// Helper to count messages in a tree structure
const countTreeNodes = (history) => {
    if (!history) return 0;
    const data = typeof history === 'string' ? JSON.parse(history) : history;
    return data.nodes ? Object.keys(data.nodes).length : (Array.isArray(data) ? data.length : 0);
};

// --- ROUTES ---

// 1. ADMIN DASHBOARD OVERVIEW
router.get("/admin/dashboard", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    // Basic Statistics
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM ai_history_chatapi WHERE is_deleted = FALSE) as total_chats,
        (SELECT COUNT(DISTINCT username) FROM ai_history_chatapi) as unique_users,
        (SELECT COUNT(*) FROM user_message_logs_chatapi WHERE date = CURRENT_DATE) as active_users_today,
        (SELECT COALESCE(SUM(message_count), 0) FROM user_message_logs_chatapi WHERE date = CURRENT_DATE) as messages_today
    `;
    
    // Recent Chats (Compatible with new structure)
    const recentChatsQuery = `
      SELECT id, username, created_at, conversation_history
      FROM ai_history_chatapi
      WHERE is_deleted = FALSE
      ORDER BY created_at DESC
      LIMIT 10
    `;

    // Top Users (Based on message logs)
    const topUsersQuery = `
      SELECT username, SUM(message_count) as total_messages
      FROM user_message_logs_chatapi
      GROUP BY username
      ORDER BY total_messages DESC
      LIMIT 5
    `;

    // Hourly Volume
    const hourlyVolumeQuery = `
      SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
      FROM ai_history_chatapi
      WHERE created_at >= CURRENT_DATE
      GROUP BY hour ORDER BY hour
    `;

    const [statsRes, recentRes, topRes, hourlyRes] = await Promise.all([
      pool.query(statsQuery),
      pool.query(recentChatsQuery),
      pool.query(topUsersQuery),
      pool.query(hourlyVolumeQuery)
    ]);

    // Process Data
    const stats = statsRes.rows[0];
    
    // Calculate message counts from JSON trees for display
    const recentChats = recentRes.rows.map(chat => ({
        ...chat,
        message_count: countTreeNodes(chat.conversation_history),
        created_at: new Date(chat.created_at).toLocaleString()
    }));

    // Chart Data
    const hourlyData = Array(24).fill(0);
    hourlyRes.rows.forEach(row => hourlyData[parseInt(row.hour)] = parseInt(row.count));

    res.render("admin/dashboard.handlebars", {
      layout: false,
      page: "Dashboard",
      stats,
      recentChats,
      topUsers: topRes.rows,
      hourlyData: JSON.stringify(hourlyData),
      currentUser: req.session.user.username
    });

  } catch (error) {
    console.error("Admin Dashboard Error:", error);
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
    const params = [];
    if (search) {
      whereClause = "WHERE username ILIKE $1";
      params.push(`%${search}%`);
    }

    // Get Users from Message Logs (Active Users)
    const usersQuery = `
      SELECT 
        username,
        SUM(message_count) as total_messages,
        MAX(date) as last_active
      FROM user_message_logs_chatapi
      ${whereClause ? `WHERE username ILIKE $1` : ""}
      GROUP BY username
      ORDER BY last_active DESC
      LIMIT ${DEFAULT_PAGE_SIZE} OFFSET ${offset}
    `;

    const countQuery = `SELECT COUNT(DISTINCT username) FROM user_message_logs_chatapi ${whereClause ? `WHERE username ILIKE $1` : ""}`;

    const [usersRes, countRes] = await Promise.all([
      pool.query(usersQuery, params),
      pool.query(countQuery, params)
    ]);

    const totalCount = parseInt(countRes.rows[0].count);

    res.render("admin/users.handlebars", {
      layout: false,
      users: usersRes.rows,
      searchQuery: search,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / DEFAULT_PAGE_SIZE)
      },
      currentUser: req.session.user.username
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading users");
  }
});

// 3. CHAT MANAGEMENT
router.get("/admin/chats", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * DEFAULT_PAGE_SIZE;
    const { username, search } = req.query;

    let conditions = ["is_deleted = FALSE"];
    let params = [];
    
    if (username) {
        conditions.push(`username ILIKE $${params.length + 1}`);
        params.push(`%${username}%`);
    }
    
    // Note: Searching inside JSONB is heavy, use sparingly
    if (search) {
        conditions.push(`conversation_history::text ILIKE $${params.length + 1}`);
        params.push(`%${search}%`);
    }

    const whereSQL = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const chatsQuery = `
      SELECT id, username, created_at, conversation_history
      FROM ai_history_chatapi
      ${whereSQL}
      ORDER BY created_at DESC
      LIMIT ${DEFAULT_PAGE_SIZE} OFFSET ${offset}
    `;

    const countQuery = `SELECT COUNT(*) FROM ai_history_chatapi ${whereSQL}`;

    const [chatsRes, countRes] = await Promise.all([
        pool.query(chatsQuery, params), // Correct: pass 'params' as second argument
        pool.query(countQuery, params)  // Correct: pass 'params' here too
    ]);

    // Format for display
    const chats = chatsRes.rows.map(c => ({
        ...c,
        message_count: countTreeNodes(c.conversation_history),
        created_at: new Date(c.created_at).toLocaleString()
    }));

    res.render("admin/chats.handlebars", {
        layout: false,
        chats,
        usernameFilter: username,
        searchQuery: search,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(parseInt(countRes.rows[0].count) / DEFAULT_PAGE_SIZE)
        },
        currentUser: req.session.user.username
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading chats");
  }
});

// 4. BULK DELETE
router.post("/admin/chats/bulk-delete", validateSessionAndRole("SuperAdmin"), async (req, res) => {
    try {
        const { chatIds } = req.body;
        if (!chatIds || !chatIds.length) return res.status(400).json({success: false});

        // Soft delete
        await pool.query("UPDATE ai_history_chatapi SET is_deleted = TRUE WHERE id = ANY($1::int[])", [chatIds]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. SYSTEM STATS (API)
router.get("/admin/system-stats", validateSessionAndRole("SuperAdmin"), async (req, res) => {
    try {
        const mem = process.memoryUsage();
        res.json({
            success: true,
            stats: {
                server: {
                    uptime: process.uptime(),
                    memory: {
                        rss: Math.round(mem.rss / 1024 / 1024) + " MB",
                        heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + " MB"
                    }
                },
                database: {
                    totalConnections: pool.totalCount,
                    idleConnections: pool.idleCount
                }
            }
        });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

export default router;