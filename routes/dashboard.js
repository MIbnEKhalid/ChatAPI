import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch';
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";

dotenv.config();
const router = express.Router();


// Constants
const DEFAULT_PAGE_SIZE_s = 20;
const DATE_RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom Range' }
];

// Admin dashboard route with more statistics
router.get("/admin/dashboard", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    // Get statistics
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM ai_history_chatapi) as total_chats,
        (SELECT COUNT(DISTINCT username) FROM ai_history_chatapi) as unique_users,
        (SELECT COUNT(*) FROM user_settings_chatapi) as user_settings_count,
        (SELECT COUNT(*) FROM user_message_logs_chatapi WHERE date = CURRENT_DATE) as active_users_today,
        (SELECT SUM(message_count) FROM user_message_logs_chatapi WHERE date = CURRENT_DATE) as messages_today,
        (SELECT COUNT(*) FROM ai_history_chatapi WHERE created_at >= NOW() - INTERVAL '1 hour') as active_chats_last_hour
    `;

    // Get recent chats with more details
    const recentChatsQuery = `
      SELECT 
        a.id, 
        a.username, 
        a.created_at, 
        a.temperature, 
        u.daily_message_limit, 
        l.message_count,
        u.ai_model,
        jsonb_array_length(a.conversation_history) as message_count_in_chat
      FROM ai_history_chatapi a
      LEFT JOIN user_settings_chatapi u ON a.username = u.username
      LEFT JOIN user_message_logs_chatapi l ON a.username = l.username AND l.date = CURRENT_DATE
      ORDER BY a.created_at DESC
      LIMIT 10
    `;

    // Get top users with more metrics
    const topUsersQuery = `
      SELECT 
        username, 
        SUM(message_count) as total_messages,
        COUNT(DISTINCT date) as active_days,
        MAX(message_count) as peak_messages_in_day
      FROM user_message_logs_chatapi
      GROUP BY username
      ORDER BY total_messages DESC
      LIMIT 5
    `;

    // Get model distribution with average temperature
    // In the admin dashboard route, update the modelDistributionQuery to cast AVG values to numeric
    const modelDistributionQuery = `
  SELECT 
    ai_model, 
    COUNT(*) as count,
    ROUND(AVG(temperature)::numeric, 2) as avg_temp,
    ROUND(AVG(daily_message_limit)::numeric, 2) as avg_limit
  FROM user_settings_chatapi
  GROUP BY ai_model
  ORDER BY count DESC
`;

    // Get hourly message volume for today
    const hourlyVolumeQuery = `
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as message_count
      FROM ai_history_chatapi
      WHERE created_at >= CURRENT_DATE
      GROUP BY hour
      ORDER BY hour
    `;

    const [
      statsResult,
      recentChatsResult,
      topUsersResult,
      modelDistributionResult,
      hourlyVolumeResult
    ] = await Promise.all([
      pool.query(statsQuery),
      pool.query(recentChatsQuery),
      pool.query(topUsersQuery),
      pool.query(modelDistributionQuery),
      pool.query(hourlyVolumeQuery)
    ]);

    const stats = statsResult.rows[0];
    const recentChats = recentChatsResult.rows;
    const topUsers = topUsersResult.rows;
    const modelDistribution = modelDistributionResult.rows;
    const hourlyVolume = hourlyVolumeResult.rows;

    // Format hourly data for chart
    const hourlyData = Array(24).fill(0);
    hourlyVolume.forEach(row => {
      hourlyData[parseInt(row.hour)] = parseInt(row.message_count);
    });

    res.render("admin/dashboard.handlebars", {
      page: "Dashboard",
      stats,
      recentChats,
      topUsers,
      modelDistribution,
      hourlyData: JSON.stringify(hourlyData),
      currentUser: req.session.user.username,
      dateRangeOptions: DATE_RANGE_OPTIONS
    });
  } catch (error) {
    console.error("Error in admin dashboard:", error);
    return res.status(500).render("Error/dError.handlebars", {
      layout: false,
      code: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred on the server.",
      details: error,
      pagename: "Home",
      page: `/dashboard`,
    });
  }
});

// Enhanced User management route with filtering
router.get("/admin/users", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || DEFAULT_PAGE_SIZE_s;
    const offset = (page - 1) * pageSize;
    const { search, model, sort, order } = req.query;

    let baseQuery = `
      FROM user_settings_chatapi u
      LEFT JOIN (
        SELECT username, COUNT(*) as chat_count 
        FROM ai_history_chatapi 
        GROUP BY username
      ) a ON u.username = a.username
      LEFT JOIN (
        SELECT username, SUM(message_count) as total_messages
        FROM user_message_logs_chatapi
        GROUP BY username
      ) l ON u.username = l.username
    `;

    let whereClause = "";
    const queryParams = [];

    // Add filters
    if (search) {
      whereClause += ` WHERE u.username ILIKE $${queryParams.length + 1}`;
      queryParams.push(`%${search}%`);
    }

    if (model) {
      whereClause += whereClause ? ' AND' : ' WHERE';
      whereClause += ` u.ai_model = $${queryParams.length + 1}`;
      queryParams.push(model);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) ${baseQuery} ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Determine sort
    const sortField = sort || 'u.created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    // Get paginated users with more metrics
    const usersQuery = `
      SELECT 
        u.username, 
        u.ai_model, 
        u.daily_message_limit,
        u.created_at as settings_created,
        u.temperature,
        COALESCE(a.chat_count, 0) as chat_count,
        COALESCE(l.total_messages, 0) as total_messages,
        (SELECT COUNT(*) FROM user_message_logs_chatapi WHERE username = u.username) as active_days
      ${baseQuery}
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const usersResult = await pool.query(usersQuery, [...queryParams, pageSize, offset]);
    const users = usersResult.rows;

    // Get available models for filter dropdown
    const modelsResult = await pool.query(`
      SELECT DISTINCT ai_model FROM user_settings_chatapi ORDER BY ai_model
    `);
    const availableModels = modelsResult.rows.map(row => row.ai_model);

    res.render("admin/users.handlebars", {
      page: "UserManagement",
      users,
      availableModels,
      searchQuery: search || "",
      selectedModel: model || "",
      sortField,
      sortOrder,
      pagination: {
        currentPage: page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      },
      currentUser: req.session.user.username
    });
  } catch (error) {
    console.error("Error in user management:", error);
    return res.status(500).render("Error/dError.handlebars", {
      layout: false,
      code: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred on the server.",
      details: error,
      pagename: "Home",
      page: `/dashboard`,
    });
  }
});

// Enhanced Chat management route with date filtering
router.get("/admin/chats", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || DEFAULT_PAGE_SIZE_s;
    const offset = (page - 1) * pageSize;
    const { username, model, dateRange, startDate, endDate, search } = req.query;

    let baseQuery = `
      FROM ai_history_chatapi a
      LEFT JOIN user_settings_chatapi u ON a.username = u.username
    `;

    let whereClause = "";
    const queryParams = [];

    // Add username filter
    if (username) {
      whereClause += " WHERE a.username = $1";
      queryParams.push(username);
    }

    // Add model filter
    if (model) {
      whereClause += whereClause ? ' AND' : ' WHERE';
      whereClause += ` u.ai_model = $${queryParams.length + 1}`;
      queryParams.push(model);
    }

    // Add date range filter
    if (dateRange) {
      let dateCondition = "";
      switch (dateRange) {
        case 'today':
          dateCondition = "a.created_at >= CURRENT_DATE";
          break;
        case 'yesterday':
          dateCondition = "a.created_at >= CURRENT_DATE - INTERVAL '1 day' AND a.created_at < CURRENT_DATE";
          break;
        case 'last7':
          dateCondition = "a.created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case 'last30':
          dateCondition = "a.created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        case 'custom':
          if (startDate && endDate) {
            dateCondition = `a.created_at >= $${queryParams.length + 1} AND a.created_at <= $${queryParams.length + 2}`;
            queryParams.push(startDate, endDate + ' 23:59:59');
          }
          break;
      }

      if (dateCondition) {
        whereClause += whereClause ? ' AND' : ' WHERE';
        whereClause += ` ${dateCondition}`;
      }
    }

    // Add search filter (searches within conversation history)
    if (search) {
      whereClause += whereClause ? ' AND' : ' WHERE';
      whereClause += ` a.conversation_history::text ILIKE $${queryParams.length + 1}`;
      queryParams.push(`%${search}%`);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) ${baseQuery} ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated chats with more details
    const chatsQuery = `
      SELECT 
        a.id,
        a.username,
        a.created_at,
        a.temperature,
        u.ai_model,
        jsonb_array_length(a.conversation_history) as message_count,
        (a.conversation_history->0->'parts'->0->>'text') as first_message_preview
      ${baseQuery}
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const chatsResult = await pool.query(
      chatsQuery,
      [...queryParams, pageSize, offset]
    );

    const chats = chatsResult.rows;

    // Get available models for filter dropdown
    const modelsResult = await pool.query(`
      SELECT DISTINCT ai_model FROM user_settings_chatapi ORDER BY ai_model
    `);
    const availableModels = modelsResult.rows.map(row => row.ai_model);

    res.render("admin/chats.handlebars", {
      page: "ChatManagement",
      chats,
      usernameFilter: username || "",
      selectedModel: model || "",
      dateRangeOptions: DATE_RANGE_OPTIONS,
      selectedDateRange: dateRange || "",
      startDate: startDate || "",
      endDate: endDate || "",
      searchQuery: search || "",
      availableModels,
      pagination: {
        currentPage: page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      },
      currentUser: req.session.user.username
    });
  } catch (error) {
    console.error("Error in chat management:", error);
    return res.status(500).render("Error/dError.handlebars", {
      layout: false,
      code: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred on the server.",
      details: error,
      pagename: "Home",
      page: `/dashboard`,
    });
  }
});

// Bulk operations for chats
router.post("/admin/chats/bulk-delete", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const { chatIds } = req.body;

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
      return res.status(400).json({ success: false, message: "No chat IDs provided" });
    }

    await pool.query(`
      DELETE FROM ai_history_chatapi 
      WHERE id = ANY($1::int[])
    `, [chatIds]);

    res.json({
      success: true,
      message: `${chatIds.length} chats deleted successfully`
    });
  } catch (error) {
    console.error("Error in bulk delete:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete chats",
      error: error.message
    });
  }
});

// User export functionality
router.get("/admin/users/export", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const { format = 'json' } = req.query;

    const usersQuery = `
      SELECT 
        u.username, 
        u.ai_model, 
        u.daily_message_limit,
        u.created_at as settings_created,
        u.temperature,
        COALESCE(COUNT(a.id), 0) as chat_count,
        COALESCE(SUM(l.message_count), 0) as total_messages
      FROM user_settings_chatapi u
      LEFT JOIN ai_history_chatapi a ON u.username = a.username
      LEFT JOIN user_message_logs_chatapi l ON u.username = l.username
      GROUP BY u.username, u.ai_model, u.daily_message_limit, u.created_at, u.temperature
      ORDER BY u.created_at DESC
    `;

    const usersResult = await pool.query(usersQuery);
    const users = usersResult.rows;

    if (format === 'csv') {
      const fields = ['username', 'ai_model', 'daily_message_limit', 'settings_created', 'temperature', 'chat_count', 'total_messages'];
      const csv = [
        fields.join(','), // header
        ...users.map(user => fields.map(field => {
          const value = user[field];
          return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(','))
      ].join('\n');

      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', 'attachment; filename=users_export.csv');
      return res.send(csv);
    }

    // Default to JSON
    res.json(users);
  } catch (error) {
    console.error("Error exporting users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export user data",
      error: error.message
    });
  }
});

// Update system settings
router.post("/admin/settings/update", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const { updates } = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, message: "Invalid updates" });
    }

    // In a real application, you would save these to a configuration store
    // For this example, we'll just return them
    res.json({
      success: true,
      message: "Settings updated (simulated)",
      updates
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update settings",
      error: error.message
    });
  }
});

// Add this near your other routes in adminRoutes.js

// Export chats route
router.post("/admin/chats/export", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const { chatIds, format = 'json' } = req.body;

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
      return res.status(400).json({ success: false, message: "No chat IDs provided" });
    }

    // Get the chat data
    const chatsQuery = `
      SELECT 
        a.id,
        a.username,
        a.conversation_history,
        a.created_at,
        a.temperature,
        u.ai_model
      FROM ai_history_chatapi a
      LEFT JOIN user_settings_chatapi u ON a.username = u.username
      WHERE a.id = ANY($1::int[])
      ORDER BY a.created_at DESC
    `;

    const chatsResult = await pool.query(chatsQuery, [chatIds]);
    const chats = chatsResult.rows;

    if (format === 'csv') {
      // Generate CSV
      const fields = ['id', 'username', 'created_at', 'temperature', 'ai_model', 'message_count', 'conversation'];
      const csvRows = chats.map(chat => {
        const conversationText = typeof chat.conversation_history === 'string'
          ? JSON.parse(chat.conversation_history)
            .map(msg => `${msg.role}: ${msg.parts?.[0]?.text || ''}`)
            .join('\n')
          : chat.conversation_history
            .map(msg => `${msg.role}: ${msg.parts?.[0]?.text || ''}`)
            .join('\n');

        return {
          id: chat.id,
          username: chat.username,
          created_at: chat.created_at,
          temperature: chat.temperature,
          ai_model: chat.ai_model,
          message_count: Array.isArray(chat.conversation_history)
            ? chat.conversation_history.length
            : JSON.parse(chat.conversation_history).length,
          conversation: conversationText
        };
      });

      // Convert to CSV string
      const csv = [
        fields.join(','), // header
        ...csvRows.map(row => fields.map(field => {
          const value = row[field];
          return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(','))
      ].join('\n');

      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', 'attachment; filename=chats_export.csv');
      return res.send(csv);
    }

    // Default to JSON
    const formattedChats = chats.map(chat => ({
      id: chat.id,
      username: chat.username,
      created_at: chat.created_at,
      temperature: chat.temperature,
      ai_model: chat.ai_model,
      conversation_history: typeof chat.conversation_history === 'string'
        ? JSON.parse(chat.conversation_history)
        : chat.conversation_history
    }));

    // In your /admin/chats/export route
    if (format === 'json' || format === 'json-raw') {
      const jsonData = JSON.stringify(formattedChats, null, 2);

      if (format === 'json') {
        res.header('Content-Type', 'application/json');
        res.header('Content-Disposition', 'attachment; filename=chats_export.json');
        return res.send(jsonData);
      } else {
        // json-raw format
        return res.json(formattedChats);
      }
    } else {
      // Return as downloadable file
      res.header('Content-Type', 'application/json');
      res.header('Content-Disposition', 'attachment; filename=chats_export.json');
      res.send(JSON.stringify(formattedChats, null, 2));
    }
  } catch (error) {
    console.error("Error exporting chats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export chats",
      error: error.message
    });
  }
});

// Add new endpoints for enhanced admin functionality

// Analytics endpoint for detailed statistics
router.get("/admin/analytics", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const { period = 'week', startDate, endDate } = req.query;
    
    // Calculate date range based on period
    let dateFilter = "";
    let paramIndex = 1;
    const params = [];
    
    if (period === 'custom' && startDate && endDate) {
      dateFilter = `WHERE created_at >= $${paramIndex++} AND created_at <= $${paramIndex++}`;
      params.push(startDate, endDate + ' 23:59:59');
    } else {
      const intervals = {
        'today': '1 day',
        'week': '7 days',
        'month': '30 days',
        'year': '365 days'
      };
      dateFilter = `WHERE created_at >= CURRENT_DATE - INTERVAL '${intervals[period] || '7 days'}'`;
    }

    // Advanced analytics queries
    const analyticsQueries = {
      messagesByDay: `
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as message_count,
          COUNT(DISTINCT username) as unique_users
        FROM ai_history_chatapi ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date
      `,
      
      userActivity: `
        SELECT 
          username,
          COUNT(*) as total_messages,
          MIN(created_at) as first_message,
          MAX(created_at) as last_message,
          COUNT(DISTINCT DATE(created_at)) as active_days
        FROM ai_history_chatapi ${dateFilter}
        GROUP BY username
        ORDER BY total_messages DESC
        LIMIT 20
      `,
      
      modelUsage: `
        SELECT 
          u.ai_model,
          COUNT(a.id) as usage_count,
          AVG(a.temperature) as avg_temperature,
          COUNT(DISTINCT a.username) as unique_users
        FROM ai_history_chatapi a
        JOIN user_settings_chatapi u ON a.username = u.username
        ${dateFilter}
        GROUP BY u.ai_model
        ORDER BY usage_count DESC
      `,
      
      peakHours: `
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as message_count,
          COUNT(DISTINCT username) as unique_users
        FROM ai_history_chatapi ${dateFilter}
        GROUP BY hour
        ORDER BY hour
      `,
      
      conversationStats: `
        SELECT 
          jsonb_array_length(conversation_history) as conversation_length,
          COUNT(*) as conversation_count
        FROM ai_history_chatapi ${dateFilter}
        GROUP BY jsonb_array_length(conversation_history)
        ORDER BY conversation_length
      `
    };

    // Execute all analytics queries
    const results = {};
    for (const [key, query] of Object.entries(analyticsQueries)) {
      results[key] = await pool.query(query, params);
    }

    res.json({
      success: true,
      period,
      data: {
        messagesByDay: results.messagesByDay.rows,
        userActivity: results.userActivity.rows,
        modelUsage: results.modelUsage.rows,
        peakHours: results.peakHours.rows,
        conversationStats: results.conversationStats.rows
      }
    });

  } catch (error) {
    console.error("Error in analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics data",
      error: error.message
    });
  }
});

// Export endpoint for data export
router.get("/admin/export/:type", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const { type } = req.params;
    const { format = 'csv', ...filters } = req.query;
    
    let query = "";
    let filename = "";
    
    switch (type) {
      case 'users':
        query = `
          SELECT 
            u.username,
            u.ai_model,
            u.daily_message_limit,
            u.temperature,
            u.created_at,
            COALESCE(a.chat_count, 0) as total_chats,
            COALESCE(l.total_messages, 0) as total_messages
          FROM user_settings_chatapi u
          LEFT JOIN (
            SELECT username, COUNT(*) as chat_count FROM ai_history_chatapi GROUP BY username
          ) a ON u.username = a.username
          LEFT JOIN (
            SELECT username, SUM(message_count) as total_messages FROM user_message_logs_chatapi GROUP BY username
          ) l ON u.username = l.username
          ORDER BY u.created_at DESC
        `;
        filename = `users_export_${new Date().toISOString().split('T')[0]}`;
        break;
        
      case 'chats':
        query = `
          SELECT 
            a.id,
            a.username,
            a.created_at,
            a.temperature,
            u.ai_model,
            jsonb_array_length(a.conversation_history) as message_count,
            (a.conversation_history->0->'parts'->0->>'text') as first_message
          FROM ai_history_chatapi a
          LEFT JOIN user_settings_chatapi u ON a.username = u.username
          ORDER BY a.created_at DESC
        `;
        filename = `chats_export_${new Date().toISOString().split('T')[0]}`;
        break;
        
      case 'analytics':
        query = `
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as total_messages,
            COUNT(DISTINCT username) as unique_users,
            AVG(temperature) as avg_temperature
          FROM ai_history_chatapi
          WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY DATE(created_at)
          ORDER BY date
        `;
        filename = `analytics_export_${new Date().toISOString().split('T')[0]}`;
        break;
        
      default:
        return res.status(400).json({ success: false, message: "Invalid export type" });
    }

    const result = await pool.query(query);
    const data = result.rows;

    if (format === 'csv') {
      // Convert to CSV
      const headers = Object.keys(data[0] || {});
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => 
          JSON.stringify(row[header] || '')
        ).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csvContent);
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json(data);
    }

  } catch (error) {
    console.error("Error in export:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
      error: error.message
    });
  }
});

// User settings update endpoint
router.put("/admin/users/:username", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const { username } = req.params;
    const { dailyLimit, aiModel, temperature } = req.body;

    // Validate inputs
    if (dailyLimit && (dailyLimit < 1 || dailyLimit > 1000)) {
      return res.status(400).json({
        success: false,
        message: "Daily limit must be between 1 and 1000"
      });
    }

    if (temperature && (temperature < 0 || temperature > 2)) {
      return res.status(400).json({
        success: false,
        message: "Temperature must be between 0 and 2"
      });
    }

    // Update user settings
    const updateQuery = `
      UPDATE user_settings_chatapi 
      SET 
        daily_message_limit = COALESCE($1, daily_message_limit),
        ai_model = COALESCE($2, ai_model),
        temperature = COALESCE($3, temperature),
        updated_at = CURRENT_TIMESTAMP
      WHERE username = $4
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [
      dailyLimit || null,
      aiModel || null,
      temperature || null,
      username
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      message: "User settings updated successfully",
      user: result.rows[0]
    });

  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user settings",
      error: error.message
    });
  }
});

// System stats endpoint for real-time monitoring
router.get("/admin/system-stats", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const systemStats = {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
        cpu: process.cpuUsage()
      },
      database: {
        connectionCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      },
      application: {
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };

    // Get recent activity
    const activityQuery = `
      SELECT 
        COUNT(*) as messages_last_hour,
        COUNT(DISTINCT username) as active_users_last_hour
      FROM ai_history_chatapi 
      WHERE created_at >= NOW() - INTERVAL '1 hour'
    `;

    const activityResult = await pool.query(activityQuery);
    systemStats.activity = activityResult.rows[0];

    res.json({
      success: true,
      stats: systemStats
    });

  } catch (error) {
    console.error("Error fetching system stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch system statistics",
      error: error.message
    });
  }
});

// Enhanced chat view endpoint with full conversation
router.get("/admin/chats/:chatId", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const { chatId } = req.params;

    const chatQuery = `
      SELECT 
        a.*,
        u.ai_model,
        u.daily_message_limit,
        l.message_count as daily_messages
      FROM ai_history_chatapi a
      LEFT JOIN user_settings_chatapi u ON a.username = u.username
      LEFT JOIN user_message_logs_chatapi l ON a.username = l.username AND l.date = DATE(a.created_at)
      WHERE a.id = $1
    `;

    const result = await pool.query(chatQuery, [chatId]);
    
    if (result.rows.length === 0) {
      return res.status(404).render("admin/error.handlebars", {
        page: "Chat Not Found",
        error: "Chat not found",
        message: "The requested chat could not be found.",
        currentUser: req.session.user.username
      });
    }

    const chat = result.rows[0];
    
    res.render("admin/chat-detail.handlebars", {
      page: "Chat Details",
      chat,
      currentUser: req.session.user.username
    });

  } catch (error) {
    console.error("Error viewing chat:", error);
    return res.status(500).render("admin/error.handlebars", {
      page: "Error",
      error: "Failed to load chat",
      message: "An error occurred while loading the chat details.",
      currentUser: req.session.user.username
    });
  }
});

export default router;