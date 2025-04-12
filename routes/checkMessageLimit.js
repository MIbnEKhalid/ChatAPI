import { pool } from "./pool.js";

export const checkMessageLimit = async (req, res, next) => {
    try {
      const username = req.session.user.username;
      const role = req.session.user.role;
  
      console.log(`[checkMessageLimit] User: ${username}, Role: ${role}`);
  
      // SuperAdmin has unlimited messages
      if (role === "SuperAdmin") {
        console.log(`[checkMessageLimit] User ${username} is a SuperAdmin. Skipping message limit check.`);
        return next();
      }
  
      // Fetch user's daily message limit
      console.log(`[checkMessageLimit] Fetching daily message limit for user: ${username}`);
      const userSettings = await pool.query(
        `SELECT daily_message_limit FROM user_settings WHERE username = $1`,
        [username]
      );
  
      const dailyLimit = userSettings.rows[0]?.daily_message_limit || 100; // Default to 100 if not set
      console.log(`[checkMessageLimit] Daily message limit for user ${username}: ${dailyLimit}`);
  
      // Check today's message count
      const today = new Date().toISOString().split("T")[0]; // Get current date in YYYY-MM-DD format
      console.log(`[checkMessageLimit] Checking message count for user ${username} on date: ${today}`);
      const messageLog = await pool.query(
        `SELECT message_count FROM user_message_logs WHERE username = $1 AND date = $2`,
        [username, today]
      );
  
      const messageCount = messageLog.rows[0]?.message_count || 0;
      console.log(`[checkMessageLimit] Current message count for user ${username} on ${today}: ${messageCount}`);
  
      if (messageCount >= dailyLimit) {
        console.warn(`[checkMessageLimit] User ${username} has reached the daily message limit of ${dailyLimit}.`);
        return res.status(403).json({ message: "Daily message limit reached." });
      }
  
      // Increment message count for the user
      if (messageLog.rows.length > 0) {
        console.log(`[checkMessageLimit] Incrementing message count for user ${username} on ${today}.`);
        await pool.query(
          `UPDATE user_message_logs SET message_count = message_count + 1 WHERE username = $1 AND date = $2`,
          [username, today]
        );
      } else {
        console.log(`[checkMessageLimit] Creating new message log entry for user ${username} on ${today}.`);
        await pool.query(
          `INSERT INTO user_message_logs (username, message_count, date) VALUES ($1, $2, $3)`,
          [username, 1, today]
        );
      }
  
      console.log(`[checkMessageLimit] Message count updated successfully for user ${username}.`);
      next();
    } catch (error) {
      console.error("[checkMessageLimit] Error in middleware:", error);
      res.status(500).json({ message: "Internal server error." });
    }
  };