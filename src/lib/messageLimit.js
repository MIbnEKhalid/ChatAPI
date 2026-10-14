import { adapter } from "../db/index.js";

/**
 * Checks message limit for a user in a Next.js Request.
 * Uses SELECT ... FOR UPDATE within a transaction to avoid race conditions.
 *
 * @param {Request} req
 * @param {object} user
 * @param {object} [customAdapter]
 * @returns {Promise<{ allowed: boolean, errorResponse?: Response }>}
 */
export async function checkMessageLimitNext(req, user, customAdapter = null) {
  const currentAdapter = customAdapter || adapter;

  try {
    const { username, role } = user || {};
    if (!username || !role) {
      return {
        allowed: false,
        errorResponse: Response.json(
          { message: "Unauthorized - missing user information" },
          { status: 401 }
        ),
      };
    }

    // superadmin bypass
    if (role === "superadmin") {
      return { allowed: true };
    }

    // Get current date in user's timezone (header is minutes offset)
    const today = new Date();
    const tzHeader = req.headers.get("timezone-offset") || "0";
    const timezoneOffset = parseInt(tzHeader, 10) || 0;
    today.setMinutes(today.getMinutes() - timezoneOffset);
    const dateString = today.toISOString().split("T")[0];

    // Fetch user settings
    const settingsQuery = await currentAdapter.query(
      `SELECT daily_message_limit FROM chatapi_user_settings WHERE username = $1`,
      [username]
    );
    const dailyLimit = settingsQuery.rows[0]?.daily_message_limit || 100;

    // Transaction with SELECT ... FOR UPDATE
    const client = await currentAdapter.connect();
    try {
      await client.query("BEGIN");

      const selectRes = await client.query(
        `SELECT message_count FROM chatapi_user_message_logs WHERE username = $1 AND date = $2 FOR UPDATE`,
        [username, dateString]
      );

      if (selectRes.rows.length) {
        const currentCount = parseInt(selectRes.rows[0].message_count || 0, 10);
        if (currentCount >= dailyLimit) {
          await client.query("ROLLBACK");
          console.warn(
            `[checkMessageLimitNext] User ${username} exceeded daily limit (${currentCount}/${dailyLimit})`
          );
          return {
            allowed: false,
            errorResponse: Response.json(
              {
                message: "Daily message limit reached",
                limit: dailyLimit,
                current: currentCount,
                reset: getResetTime(timezoneOffset),
              },
              { status: 429 }
            ),
          };
        }

        await client.query(
          `UPDATE chatapi_user_message_logs SET message_count = message_count + 1 WHERE username = $1 AND date = $2 RETURNING message_count`,
          [username, dateString]
        );
        await client.query("COMMIT");
      } else {
        await client.query(
          `INSERT INTO chatapi_user_message_logs (username, date, message_count) VALUES ($1, $2, 1)`,
          [username, dateString]
        );
        await client.query("COMMIT");
      }
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    return { allowed: true };
  } catch (error) {
    console.error("[checkMessageLimitNext] Error:", error);
    return {
      allowed: false,
      errorResponse: Response.json(
        {
          message: "Message limit check failed",
          ...(process.env.NODE_ENV === "development" && {
            error: error.message,
            stack: error.stack,
          }),
        },
        { status: 500 }
      ),
    };
  }
}

function getResetTime(offsetMinutes = 0) {
  const now = new Date();
  const reset = new Date(now);
  reset.setMinutes(reset.getMinutes() - offsetMinutes);
  reset.setDate(reset.getDate() + 1);
  reset.setHours(0, 0, 0, 0);
  reset.setMinutes(reset.getMinutes() + offsetMinutes);
  return reset.toISOString();
}
