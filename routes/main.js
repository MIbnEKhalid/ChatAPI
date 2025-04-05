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

router.post('/api/bot-chat', async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    return res.status(400).json({ message: "Chat message is required." });
  }


  const temperature = Math.min(Math.max(parseFloat(req.body.temperature || 1.0), 0), 2);
  let conversationHistory = [];
  const chatId = req.body.chatId;

  if (chatId) {
    const fetchedHistory = await fetchChatHistoryById(chatId);
    if (fetchedHistory && fetchedHistory.conversation_history) {
      conversationHistory = fetchedHistory.conversation_history;
    }
  }

  conversationHistory.push({ role: "user", parts: [{ text: userMessage }] });

  let geminiApiKey;
  if (req.session.user.username === "ibnekhalid") {
    geminiApiKey = process.env.GEMINI_API_KEY_ibnekhalid;
  }
  else if (req.session.user.username === "maaz.waheed") {
    geminiApiKey = process.env.GEMINI_API_KEY_maaz_waheed;
  }
  else {
    const aiResponseText = "User not authorized to access Gemini API.";
    res.json({ aiResponse: aiResponseText, newChatId: req.newChatId });
  }

  if (!geminiApiKey) {
    return res.status(500).json({ error: "Gemini API key not configured." });
  }

  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

  try {
    const geminiResponse = await fetch(geminiApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: conversationHistory,
        generationConfig: {
          temperature: temperature // Add temperature to the request
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json();
      console.error("Gemini API error:", errorData);
      return res.status(500).json({ message: "Gemini API request failed.", details: errorData });
    }

    const geminiData = await geminiResponse.json();
    const aiResponseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (aiResponseText) {
      conversationHistory.push({ role: "model", parts: [{ text: aiResponseText }] });

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

      res.json({ aiResponse: aiResponseText, newChatId: req.newChatId });
    } else {
      res.status(500).json({ message: "Gemini API returned empty response." });
    }

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    res.status(500).json({ message: "Error processing Gemini API.", error: error.message, details: error });
  }
});

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