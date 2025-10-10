import { pool } from "./pool.js";

// Cache for user settings to reduce database queries
const userSettingsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Clear cache periodically
setInterval(() => {
  userSettingsCache.clear();
}, CACHE_TTL);

export const checkMessageLimit = async (req, res, next) => {
  // Start performance measurement
  const startTime = process.hrtime();

  try {
    const { username: UserName, role } = req.session.user;

    if (!UserName || !role) {
      console.warn('[checkMessageLimit] Missing UserName or role in session');
      return res.status(401).json({ message: "Unauthorized - missing user information" });
    }

    // SuperAdmin bypass
    if (role === "SuperAdmin") {
      console.log(`[checkMessageLimit] SuperAdmin ${UserName} bypassed message limit check`);
      return next();
    }

    // Get current date in user's timezone
    const today = new Date();
    const timezoneOffset = req.headers['timezone-offset'] || 0;
    today.setMinutes(today.getMinutes() - timezoneOffset);
    const dateString = today.toISOString().split('T')[0];

    // Try to get settings from cache first
    let userSettings = userSettingsCache.get(UserName);

    if (!userSettings) {
      console.log(`[checkMessageLimit] Fetching settings for user: ${UserName}`);
      const settingsQuery = await pool.query(
        `SELECT daily_message_limit FROM user_settings_chatapi WHERE "UserName" = $1`,
        [UserName]
      );

      userSettings = {
        dailyLimit: settingsQuery.rows[0]?.daily_message_limit || 100,
        lastUpdated: Date.now()
      };

      userSettingsCache.set(UserName, userSettings);
    }

    const { dailyLimit } = userSettings;

    // Check message count with a single query using upsert approach
    const messageCountResult = await pool.query(
      `INSERT INTO user_message_logs_chatapi ("UserName", date, message_count)
       VALUES ($1, $2, 1)
       ON CONFLICT ("UserName", date)
       DO UPDATE SET message_count = user_message_logs_chatapi.message_count + 1
       RETURNING message_count`,
      [UserName, dateString]
    );

    const currentCount = messageCountResult.rows[0]?.message_count || 1;

    if (currentCount > dailyLimit) {
      console.warn(`[checkMessageLimit] User ${UserName} exceeded daily limit (${currentCount}/${dailyLimit})`);

      // Rollback the increment since they're over limit
      await pool.query(
        `UPDATE user_message_logs_chatapi 
         SET message_count = message_count - 1 
         WHERE "UserName" = $1 AND date = $2`,
        [UserName, dateString]
      );

      return res.status(429).json({
        message: "Daily message limit reached",
        limit: dailyLimit,
        current: currentCount - 1, // Show count before this attempt
        reset: getResetTime(timezoneOffset)
      });
    }

    // Log performance
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);
    console.log(`[checkMessageLimit] Processed in ${duration}ms for ${UserName}`);

    next();
  } catch (error) {
    console.error("[checkMessageLimit] Error:", error);

    // Include error details in development
    const errorResponse = {
      message: "Message limit check failed",
      ...(process.env.NODE_ENV === 'development' && {
        error: error.message,
        stack: error.stack
      })
    };

    res.status(500).json(errorResponse);
  }
};

// Helper function to get reset time in user's timezone
function getResetTime(offsetMinutes = 0) {
  const now = new Date();
  const reset = new Date(now);

  // Adjust for timezone offset
  reset.setMinutes(reset.getMinutes() - offsetMinutes);

  // Set to midnight of next day
  reset.setDate(reset.getDate() + 1);
  reset.setHours(0, 0, 0, 0);

  // Convert back to server time
  reset.setMinutes(reset.getMinutes() + offsetMinutes);

  return reset.toISOString();
}