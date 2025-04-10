import express from "express";
import crypto from "crypto";
import dotenv from "dotenv";

import { pool } from "./pool.js";
import { authenticate, validateSession, checkRolePermission, validateSessionAndRole, getUserData } from "mbkauth";
import fetch from 'node-fetch';

dotenv.config();
const router = express.Router();
const UserCredentialTable = process.env.UserCredentialTable;

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

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
    await pool.query(`UPDATE "${UserCredentialTable}" SET "SessionId" = NULL`);

    // Clear the session table
    await pool.query('DELETE FROM "session"');

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
    const historyResult = await pool.query(
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
    const historyResult = await pool.query(
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
    const result = await pool.query(
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

router.post('/api/bot-chat', async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    return res.status(400).json({ message: "Chat message is required." });
  }
  const username = req.session.user.username; // Assuming you have user session

  const userSettings = await getUserSettings(username);
  const temperature = Math.min(Math.max(parseFloat(userSettings.temperature || 1.0), 0), 2);
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

  let geminiApiKey;
  geminiApiKey = process.env.GEMINI_API_KEY_maaz_waheed;

  if (!geminiApiKey) {
    return res.status(500).json({ error: "Gemini API key not configured." });
  }
  const models_name = userSettings.modelName; //"gemini-1.5-flash" "gemini-2.0-flash"
  console.log(models_name);

  let aiResponseText;
  try {
    aiResponseText = await gemini(geminiApiKey, models_name, conversationHistory, temperature);
  } catch (geminiError) { // Catch errors from gemini function
    return res.status(500).json({ message: "Error processing Gemini API.", error: geminiError.message });
  }

  if (aiResponseText) {
    conversationHistory.push({ role: "model", parts: [{ text: aiResponseText }] });

    try { // Wrap database updates/inserts in try-catch
      if (chatId) {
        await pool.query(
          `UPDATE Ai_history
                   SET conversation_history = $1,
                       created_at = CURRENT_TIMESTAMP,
                       temperature = $3
                   WHERE id = $2`,
          [JSON.stringify(conversationHistory), chatId, temperature]
        );
      } else {
        const insertResult = await pool.query(
          `INSERT INTO Ai_history (conversation_history, username, temperature)
                   VALUES ($1, $2, $3)
                   RETURNING id`,
          [JSON.stringify(conversationHistory), req.session.user.username, temperature]
        );
        req.newChatId = insertResult.rows[0].id;
      }
    } catch (dbError) { // Catch errors from database operations (pool.query)
      console.error("Error updating/inserting chat history:", dbError);
      return res.status(500).json({ message: "Failed to save chat history.", error: dbError.message });
    }


    res.json({ aiResponse: aiResponseText, newChatId: req.newChatId });
  } else {
    res.status(500).json({ message: "Gemini API returned empty response." });
  }

}
);

router.post('/api/chat/clear-history/:chatId', async (req, res) => {
  const chatId = req.params.chatId;
  if (!chatId) {
    return res.status(400).json({ message: "Chat ID is required to delete history." });
  }
  try {
    await pool.query('DELETE FROM Ai_history WHERE id = $1', [chatId]);
    res.json({ status: 200, message: "Chat history deleted successfully.", chatId: chatId });
  } catch (error) {
    console.error(`Error deleting chat history with ID: ${chatId}`, error);
    res.status(500).json({ message: "Failed to delete chat history.", error: error.message });
  }
});

async function fetchUserSettings(username) {
  try {
    const settingsResult = await pool.query(
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
    await pool.query(
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