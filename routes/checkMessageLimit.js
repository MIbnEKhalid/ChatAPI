import { pool } from "./pool.js";

// No in-memory caching (serverless / Vercel friendly)

export const checkMessageLimit = async (req, res, next) => {
  // Start performance measurement
  const startTime = process.hrtime();

  try {
    const { username: username, role } = req.session.user;

    if (!username || !role) {
      console.warn('[checkMessageLimit] Missing username or role in session');
      return res.status(401).json({ message: "Unauthorized - missing user information" });
    }

    // SuperAdmin bypass
    if (role === "SuperAdmin") {
      console.log(`[checkMessageLimit] SuperAdmin ${username} bypassed message limit check`);
      return next();
    }

    // Get current date in user's timezone (header is minutes offset)
    const today = new Date();
    const timezoneOffset = parseInt(req.headers['timezone-offset'] || '0', 10) || 0;
    today.setMinutes(today.getMinutes() - timezoneOffset);
    const dateString = today.toISOString().split('T')[0];

    // Fetch user settings directly (no caching in serverless environment)
    const settingsQuery = await pool.query(
      `SELECT daily_message_limit FROM user_settings_chatapi WHERE username = $1`,
      [username]
    );
    const dailyLimit = settingsQuery.rows[0]?.daily_message_limit || 100;

    // Use a transaction with SELECT ... FOR UPDATE to avoid increment-then-decrement race
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const selectRes = await client.query(
        `SELECT message_count FROM user_message_logs_chatapi WHERE username = $1 AND date = $2 FOR UPDATE`,
        [username, dateString]
      );

      if (selectRes.rows.length) {
        const currentCount = parseInt(selectRes.rows[0].message_count || 0, 10);
        if (currentCount >= dailyLimit) {
          await client.query('ROLLBACK');
          console.warn(`[checkMessageLimit] User ${username} exceeded daily limit (${currentCount}/${dailyLimit})`);
          return res.status(429).json({
            message: "Daily message limit reached",
            limit: dailyLimit,
            current: currentCount,
            reset: getResetTime(timezoneOffset)
          });
        }

        const updateRes = await client.query(
          `UPDATE user_message_logs_chatapi SET message_count = message_count + 1 WHERE username = $1 AND date = $2 RETURNING message_count`,
          [username, dateString]
        );

        await client.query('COMMIT');
        // continue
      } else {
        const insertRes = await client.query(
          `INSERT INTO user_message_logs_chatapi (username, date, message_count) VALUES ($1, $2, 1)`,
          [username, dateString]
        );
        await client.query('COMMIT');
      }
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    // Log performance
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);
    console.log(`[checkMessageLimit] Processed in ${duration}ms for ${username}`);

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