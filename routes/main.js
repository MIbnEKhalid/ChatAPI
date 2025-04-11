import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import pgSession from "connect-pg-simple";
import fs from "fs";
import { promisify } from "util";
const PgSession = pgSession(session);
import multer from "multer";
import { timeStamp } from "console";
import { exec } from "child_process";
import speakeasy from "speakeasy";
import dotenv from "dotenv";
import { engine } from "express-handlebars"; // Import Handlebars
import Handlebars from "handlebars";

import { marked, use } from 'marked';

import { pool1 } from "./pool.js";
import { authenticate } from "./auth.js";
import { validateSession, checkRolePermission, validateSessionAndRole, getUserData } from "./validateSessionAndRole.js";
import fetch from 'node-fetch';

dotenv.config();
const router = express.Router();
const UserCredentialTable = process.env.UserCredentialTable;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storage = multer.memoryStorage();
const upload = multer({ storage });
const cookieExpireTime = 2 * 24 * 60 * 60 * 1000; // 12 hours
// cookieExpireTime: 2 * 24 * 60 * 60 * 1000, 2 day
// cookieExpireTime:  1* 60 * 1000, 1 min 
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.use(
  session({
    store: new PgSession({
      pool: pool1, // Connection pool
      tableName: "session", // Use another table-name than the default "session" one
    }),
    secret: process.env.session_seceret_key, // Replace with your secret key
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: cookieExpireTime,
    },
  })
);

router.use((req, res, next) => {
  if (req.session && req.session.user) {
    const userAgent = req.headers["user-agent"];
    const userIp =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const formattedIp = userIp === "::1" ? "127.0.0.1" : userIp;

    req.session.otherInfo = {
      ip: formattedIp,
      browser: userAgent,
    };

    next();
  } else {
    next();
  }
});

// Save the username in a cookie, the cookie user name is use
// for displaying user name in profile menu. This cookie is not use anyelse where.
// So it is safe to use.
router.use(async (req, res, next) => {
  if (req.session && req.session.user) {
    res.cookie("username", req.session.user.username, {
      maxAge: cookieExpireTime,
    });
    const query = `SELECT "Role" FROM "${UserCredentialTable}" WHERE "UserName" = $1`;
    const result = await pool1.query(query, [req.session.user.username]);
    if (result.rows.length > 0) {
      req.session.user.role = result.rows[0].Role;
      res.cookie("userRole", req.session.user.role, {
        maxAge: cookieExpireTime,
      });
    } else {
      req.session.user.role = null;
    }
  }
  next();
});

router.get(["/login", "/signin"], (req, res) => {
  if (req.session && req.session.user) {
    return res.render("staticPage/login.handlebars", { userLoggedIn: true, UserName: req.session.user.username });
  }
  return res.render("staticPage/login.handlebars");
});

//Invoke-RestMethod -Uri http://localhost:3030/terminateAllSessions -Method POST
// Terminate all sessions route
router.post("/terminateAllSessions", authenticate(process.env.Main_SECRET_TOKEN), async (req, res) => {
  try {
    await pool1.query(`UPDATE "${UserCredentialTable}" SET "SessionId" = NULL`);

    // Clear the session table
    await pool1.query('DELETE FROM "session"');

    // Destroy all sessions on the server
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res
          .status(500)
          .json({ success: false, message: "Failed to terminate sessions" });
      }
      console.log("All sessions terminated successfully");
      res.status(200).json({
        success: true,
        message: "All sessions terminated successfully",
      });
    });
  } catch (err) {
    console.error("Database query error during session termination:", err);
    res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}
);

router.post("/login", async (req, res) => {

  const { username, password, token, recaptcha } = req.body;
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptcha}`;

  //bypass recaptcha for specific users
  if (username !== "ibnekhalid" && username !== "maaz.waheed" && username !== "support") {
    const response = await fetch(verificationUrl, { method: 'POST' });
    const body = await response.json();

    if (!body.success) {
      return res.status(400).json({ success: false, message: `Failed reCAPTCHA verification` });
    }
  }

  if (!username || !password) {
    console.log("Login attempt with missing username or password");
    return res.status(400).json({
      success: false,
      message: "Username and password are required",
    });
  }

  try {
    // Query to check if the username exists
    const userQuery = `SELECT * FROM "${UserCredentialTable}" WHERE "UserName" = $1`;
    const userResult = await pool1.query(userQuery, [username]);

    if (userResult.rows.length === 0) {
      console.log(`Login attempt with non-existent username: \"${username}\"`);
      return res
        .status(404)
        .json({ success: false, message: "Username does not exist" });
    }

    const user = userResult.rows[0];

    // Check if the password matches
    if (user.Password !== password) {
      console.log(`Incorrect password attempt for username: \"${username}\"`);
      return res
        .status(401)
        .json({ success: false, message: "Incorrect password" });
    }

    // Check if the account is inactive
    if (!user.Active) {
      console.log(
        `Inactive account login attempt for username: \"${username}\"`
      );
      return res
        .status(403)
        .json({ success: false, message: "Account is inactive" });
    } 
    // Generate session ID
    const sessionId = crypto.randomBytes(256).toString("hex"); // Generate a secure random session ID
    await pool1.query(`UPDATE "${UserCredentialTable}" SET "SessionId" = $1 WHERE "id" = $2`, [
      sessionId,
      user.id,
    ]);

    // Store session ID in session
    req.session.user = {
      id: user.id,
      username: user.UserName,
      sessionId,
    };

    console.log(`User \"${username}\" logged in successfully`);
    res.status(200).json({
      success: true,
      message: "Login successful",
      sessionId,
    });
  } catch (err) {
    console.error("Database query error:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.post("/logout", async (req, res) => {
  if (req.session.user) {
    try {
      const { id, username } = req.session.user;
      const query = `SELECT "Active" FROM "${UserCredentialTable}" WHERE "id" = $1`;
      const result = await pool1.query(query, [id]);

      if (result.rows.length > 0 && !result.rows[0].Active) {
        console.log("Account is inactive during logout");
      }

      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
          return res
            .status(500)
            .json({ success: false, message: "Logout failed" });

        }
        res.clearCookie("connect.sid");
        console.log(`User \"${username}\" logged out successfully`);
        res.status(200).json({ success: true, message: "Logout successful" });
      });
    } catch (err) {
      console.error("Database query error during logout:", err);
      res
        .status(500)
        .json({ success: false, message: "Internal Server Error" });
      return res.render('templates/Error/500', { error: err }); // Assuming you have an error template
    }
  } else {
    res.status(400).json({ success: false, message: "Not logged in" });
  }
});




router.get("/chatbot/:chatId?", validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const username = req.session.user.username; // Get username from session
    const userSettings = await fetchUserSettings(username); // Fetch user settings
    res.render('mainPages/chatbot.handlebars', {
      chatId: chatId,
      settings: userSettings // Pass settings to the template
    });
  } catch (err) {
    console.error("Error rendering chatbot page:", err);
    res.status(500).render("templates/Error/500", { error: err });
  }
});

async function fetchChatHistories(username) {
  try {
    const historyResult = await pool1.query(
      'SELECT id, created_at, temperature FROM Ai_history WHERE username = $1 ORDER BY created_at DESC',
      [username]
    );
    return historyResult.rows.map(row => {
      const createdAt = new Date(row.created_at);
      const now = new Date();
      const diffInSeconds = Math.floor((now - createdAt) / 1000);

      let formattedTime;
      if (diffInSeconds < 60) {
        formattedTime = `${diffInSeconds} seconds ago`;
      } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        formattedTime = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
      } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        formattedTime = `${hours} hour${hours > 1 ? 's' : ''} ago`;
      } else {
        const days = Math.floor(diffInSeconds / 86400);
        formattedTime = `${days} day${days > 1 ? 's' : ''} ago`;
      }

      return {
        ...row,
        created_at: formattedTime,
        temperature: row.temperature || 0.5 // Default if null
      };
    });
  } catch (error) {
    console.error("Error fetching chat histories:", error);
    return [];
  }
}

async function fetchChatHistoryById(chatId) {
  try {
    const historyResult = await pool1.query(
      'SELECT id, conversation_history, temperature FROM Ai_history WHERE id = $1',
      [chatId]
    );
    return historyResult.rows[0];
  } catch (error) {
    console.error("Error fetching chat history by ID:", error);
    return null;
  }
}

router.get('/api/chat/histories', validateSessionAndRole("SuperAdmin"), async (req, res) => { // Add session validation if needed, adjust role as necessary
  try {
    const username = req.session.user.username; // Get username from session
    const chatHistories = await fetchChatHistories(username); // Pass username to fetchChatHistories
    res.json(chatHistories);
  } catch (error) {
    console.error("Error fetching chat histories:", error);
    res.status(500).json({ message: "Error fetching chat histories.", error: error.message });
  }
});

// New endpoint to get a specific chat history with messages
router.get('/api/chat/histories/:chatId', async (req, res) => {
  const chatId = req.params.chatId;
  if (!chatId) {
    return res.status(400).json({ message: "Chat ID is required." });
  }
  const chatHistory = await fetchChatHistoryById(chatId);
  if (chatHistory) {
    res.json(chatHistory);
  } else {
    res.status(404).json({ message: "Chat history not found." });
  }
});
async function getUserSettings(username) {
  try {
    const result = await pool1.query(
      `SELECT ai_model, temperature
       FROM user_settings
       WHERE username = $1`,
      [username]
    );

    if (result.rows.length > 0) {
      // User settings found
      const settings = result.rows[0];
      return {
        modelName: settings.ai_model, // Assuming column name is ai_model
        temperature: settings.temperature // Assuming column name is temperature
      };
    } else {
      // No settings found for this user
      return null; // Or you could return a default settings object instead of null
    }

  } catch (error) {
    console.error("Error retrieving user settings:", error);
    return null; // Or throw the error if you want to handle it differently up the call stack
  }
}
async function gemini(geminiApiKey, models_name, conversationHistory, temperature) {
  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1/models/${models_name}:generateContent?key=${geminiApiKey}`;

  try {
    const geminiResponse = await fetch(geminiApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: conversationHistory,
        generationConfig: {
          temperature: temperature
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json();
      console.error("Gemini API error:", errorData);
      // Improved error message to include details from Gemini API response
      throw new Error(`Gemini API request failed with status ${geminiResponse.status}: ${errorData.error?.message || 'Unknown error'}`);
    }

    const geminiData = await geminiResponse.json();
    const aiResponseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    return aiResponseText;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    // Re-throw the error to be handled by the route handler
    throw error;
  }
}

async function Deepseek(deepseekApiKey, models_name, conversationHistory, temperature) {
  const deepseekApiUrl = "https://api.deepseek.com/chat/completions";

  try {
    const deepseekResponse = await fetch(deepseekApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: models_name,   //"deepseek-chat",
        messages: conversationHistory,
        stream: false,
        temperature: temperature
      })
    });

    if (!deepseekResponse.ok) {
      const errorData = await deepseekResponse.json();
      console.error("Deepseek API error:", errorData);
      throw new Error(`Deepseek API request failed with status ${deepseekResponse.status}: ${errorData.error?.message || 'Unknown error'}`);
    }

    const deepseekData = await deepseekResponse.json();
    const aiResponseText = deepseekData.choices?.[0]?.message?.content;
    return aiResponseText;
  } catch (error) {
    console.error("Error calling Deepseek API:", error);
    throw error;
  }
}
const transformGeminiToDeepseekHistory = (geminiHistory) => {
  return geminiHistory.map(message => {
      let content = ""; // Default content if something is missing

      if (message.parts && Array.isArray(message.parts) && message.parts.length > 0 && message.parts[0].text) {
          content = message.parts[0].text;
      } else {
          console.warn("Warning: Gemini message part structure unexpected or missing text. Using default content.", message);
          // You could potentially add more sophisticated default content logic here
          // or even decide to skip the message entirely if that's more appropriate for your use case.
          content = "No content provided in Gemini history message."; // More informative default
      }

      return {
          role: message.role,
          content: content
      };
  });
};
router.post('/api/bot-chat', async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    return res.status(400).json({ message: "Chat message is required." });
  }
  const username = req.session.user.username; // Assuming you have user session

  const userSettings = await getUserSettings(username);
  const temperature = Math.min(Math.max(parseFloat(userSettings.temperature|| 1.0), 0), 2);
  let conversationHistory = [];
  const chatId = req.body.chatId;

  try { // Wrap the chat history fetching in try-catch
      if (chatId) {
          const fetchedHistory = await fetchChatHistoryById(chatId);
          if (fetchedHistory && fetchedHistory.conversation_history) {
              conversationHistory = fetchedHistory.conversation_history;
          } else if (chatId && !fetchedHistory) {
              // Handle case where chatId is provided but no history found (optional, depends on desired behavior)
              return res.status(404).json({ message: "Chat history not found for the given chatId." });
          }
      }
  } catch (dbError) { // Catch errors from fetchChatHistoryById (database errors)
      console.error("Error fetching chat history:", dbError);
      return res.status(500).json({ message: "Failed to fetch chat history.", error: dbError.message });
  }


  conversationHistory.push({ role: "user", parts: [{ text: userMessage }] });

  let aiResponseText;
  const models_name =userSettings.modelName; //"gemini-1.5-flash" "gemini-2.0-flash" "deepseek-chat"
  console.log("Model Name:", models_name);

  // Function to transform Gemini history to Deepseek history format
  const transformGeminiToDeepseekHistory = (geminiHistory) => {
      return geminiHistory.map(message => ({
          role: message.role,
          content: message.parts[0].text // Assuming parts[0].text always exists
      }));
  };

  if (models_name === "deepseek-chat") {
      let deepseekApiKey;
      deepseekApiKey = process.env.Deepseek_maaz_waheed; // Assuming you have DEEPSEEK_API_KEY in your env
      if (!deepseekApiKey) {
        return res.status(500).json({ error: "Deepseek API key not configured." });
      }
      try {
        // Transform conversation history to Deepseek format before calling Deepseek API
        const deepseekFormattedHistory = transformGeminiToDeepseekHistory(conversationHistory);
        aiResponseText = await Deepseek(deepseekApiKey, models_name, deepseekFormattedHistory, temperature);
      } catch (deepseekError) { // Catch errors from Deepseek function
        return res.status(500).json({ message: "Error processing Deepseek API.", error: deepseekError.message });
      }
  } else { // Default to Gemini if models_name is not "deepseek-chat" or any other model you want to add later
      let geminiApiKey;
      geminiApiKey = process.env.GEMINI_API_KEY_maaz_waheed;

      if (!geminiApiKey) {
        return res.status(500).json({ error: "Gemini API key not configured." });
      }
      try {
        aiResponseText = await gemini(geminiApiKey, models_name, conversationHistory, temperature);
      } catch (geminiError) { // Catch errors from gemini function
        return res.status(500).json({ message: "Error processing Gemini API.", error: geminiError.message });
      }
  }


  if (aiResponseText) {
    conversationHistory.push({ role: "model", parts: [{ text: aiResponseText }] });

    try { // Wrap database updates/inserts in try-catch
        if (chatId) {
            await pool1.query(
                `UPDATE Ai_history
                 SET conversation_history = $1,
                     created_at = CURRENT_TIMESTAMP,
                     temperature = $3
                 WHERE id = $2`,
                [JSON.stringify(conversationHistory), chatId, temperature]
            );
        } else {
            const insertResult = await pool1.query(
                `INSERT INTO Ai_history (conversation_history, username, temperature)
                 VALUES ($1, $2, $3)
                 RETURNING id`,
                [JSON.stringify(conversationHistory), req.session.user.username, temperature]
            );
            req.newChatId = insertResult.rows[0].id;
        }
    } catch (dbError) { // Catch errors from database operations (pool1.query)
        console.error("Error updating/inserting chat history:", dbError);
        return res.status(500).json({ message: "Failed to save chat history.", error: dbError.message });
    }


    res.json({ aiResponse: aiResponseText, newChatId: req.newChatId });
  } else {
    res.status(500).json({ message: "AI API returned empty response." });
  }

}
);

router.post('/api/chat/clear-history/:chatId', async (req, res) => {
  const chatId = req.params.chatId;
  if (!chatId) {
    return res.status(400).json({ message: "Chat ID is required to delete history." });
  }
  try {
    await pool1.query('DELETE FROM Ai_history WHERE id = $1', [chatId]);
    res.json({ status: 200, message: "Chat history deleted successfully.", chatId: chatId });
  } catch (error) {
    console.error(`Error deleting chat history with ID: ${chatId}`, error);
    res.status(500).json({ message: "Failed to delete chat history.", error: error.message });
  }
});

async function fetchUserSettings(username) {
  try {
    const settingsResult = await pool1.query(
      'SELECT theme, font_size, ai_model, temperature FROM user_settings WHERE username = $1',
      [username]
    );
    if (settingsResult.rows.length > 0) {
      return settingsResult.rows[0];
    } else {
      // Default settings if no settings found for the user
      return {
        theme: 'dark',
        font_size: 16,
        ai_model: 'default',
        temperature: 1.0
      };
    }
  } catch (error) {
    console.error("Error fetching user settings:", error);
    return { // Return default settings even on error to prevent app crash
      theme: 'dark',
      font_size: 16,
      ai_model: 'default',
      temperature: 1.0
    };
  }
}

async function saveUserSettings(username, settings) {
  const { theme, fontSize, model, temperature } = settings;
  try {
    await pool1.query(
      `INSERT INTO user_settings (username, theme, font_size, ai_model, temperature)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username)
       DO UPDATE SET
          theme = $2,
          font_size = $3,
          ai_model = $4,
          temperature = $5,
          updated_at = CURRENT_TIMESTAMP`,
      [username, theme, fontSize, model, temperature]
    );
    return true;
  } catch (error) {
    console.error("Error saving user settings:", error);
    return false;
  }
}


// GET endpoint to fetch user settings (Username based)
router.get('/api/user-settings', validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const username = req.session.user.username; // Get username from session
    const userSettings = await fetchUserSettings(username);
    res.json(userSettings);
  } catch (error) {
    console.error("Error in /api/user-settings:", error);
    res.status(500).json({ message: "Error fetching user settings", error: error.message });
  }
});

// POST endpoint to save user settings (Username based)
router.post('/api/save-settings', validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    const username = req.session.user.username; // Get username from session
    const settings = req.body; // Settings data from the request body
    const isSaved = await saveUserSettings(username, settings);
    if (isSaved) {
      res.json({ success: true, message: "Settings saved successfully." });
    } else {
      res.status(500).json({ success: false, message: "Failed to save settings." });
    }
  } catch (error) {
    console.error("Error in /api/save-settings:", error);
    res.status(500).json({ success: false, message: "Error saving settings", error: error.message });
  }
});


export default router;