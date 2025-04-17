import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch';
import { pool } from "./pool.js";
import { validateSession, checkRolePermission, validateSessionAndRole, getUserData } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";

dotenv.config();
const router = express.Router();
const UserCredentialTable = process.env.UserCredentialTable;

let COOKIE_EXPIRE_TIME = 1000 * 60 * 60 * 24 * 7; // 7 days in milliseconds
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.get(["/login", "/signin"], (req, res) => {
  if (req.session && req.session.user) {
    return res.render("staticPage/login.handlebars", { userLoggedIn: true, UserName: req.session.user.username });
  }
  return res.render("staticPage/login.handlebars");
});



router.get("/chatbot/:chatId?", validateSessionAndRole("Any"), async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const username = req.session.user.username; // Get username from session
    const userSettings = await fetchUserSettings(username); // Fetch user settings
    res.render('mainPages/chatbot.handlebars', {
      chatId: chatId,
      settings: userSettings,
      UserName: req.session.user.username,
      role: req.session.user.role,
      userLoggedIn: true,
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

router.get('/api/chat/histories', validateSessionAndRole("Any"), async (req, res) => { // Add session validation if needed, adjust role as necessary
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
async function mallow(prompt) {
  const mallowApiUrl = "https://literate-slightly-seahorse.ngrok-free.app/generate"; // As per your curl command

  try {
    const mallowResponse = await fetch(mallowApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt }) // Send prompt in the body
    });

    if (!mallowResponse.ok) {
      const errorData = await mallowResponse.json();
      console.error("Mallow API error:", errorData);
      throw new Error(`Mallow API request failed with status ${mallowResponse.status}: ${errorData.error?.message || 'Unknown error'}`);
    }

    const mallowData = await mallowResponse.json();
    // Assuming the API returns the response text in a field like 'response' or similar.
    // You might need to adjust this based on the actual API response structure.
    const aiResponseText = mallowData.response; // Adjust 'response' to the actual field name
    return aiResponseText;

  } catch (error) {
    const aiResponseText = "API service is not available. Please contact [Maaz Waheed](https://github.com/42Wor) to start the API service.";
    return aiResponseText;
  }
}

router.post('/api/bot-chat', checkMessageLimit, async (req, res) => {
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

  let aiResponseText;
  const models_name = userSettings.modelName; //"gemini-1.5-flash" "gemini-2.0-flash" "deepseek-chat" or "mallow"
  console.log("Model Name:", models_name);


  if (models_name === "deepseek-chat") {
    // ... Deepseek API code (as you provided) ...
    let deepseekApiKey;
    deepseekApiKey = process.env.Deepseek_maaz_waheed; // Assuming you have DEEPSEEK_API_KEY in your env
    if (!deepseekApiKey) {
      return res.status(500).json({ error: "Deepseek API key not configured." });
    }
    try {
      const deepseekFormattedHistory = transformGeminiToDeepseekHistory(conversationHistory);
      aiResponseText = await Deepseek(deepseekApiKey, models_name, deepseekFormattedHistory, temperature);
    } catch (deepseekError) {
      return res.status(500).json({ message: "Error processing Deepseek API.", error: deepseekError.message });
    }

  } else if (models_name === "mallow-t1") { // Add condition for mallow
    try {
      aiResponseText = await mallow(userMessage); // Call mallow function with user message
    } catch (mallowError) {
      return res.status(500).json({ message: "Error processing Mallow API.", error: mallowError.message });
    }

  } else { // Default to Gemini if modelName is not deepseek-chat or mallow (or any other model you might add)
    let geminiApiKey;
    geminiApiKey = process.env.GEMINI_API_KEY_maaz_waheed;

    if (!geminiApiKey) {
      return res.status(500).json({ error: "Gemini API key not configured." });
    }
    try {
      aiResponseText = await gemini(geminiApiKey, models_name, conversationHistory, temperature);
    } catch (geminiError) {
      return res.status(500).json({ message: "Error processing Gemini API.", error: geminiError.message });
    }
  }

  if (aiResponseText) {
    if (models_name !== "mallow") { // Only save history if not mallow
      conversationHistory.push({ role: "model", parts: [{ text: aiResponseText }] });

      try {
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
      } catch (dbError) {
        console.error("Error updating/inserting chat history:", dbError);
        return res.status(500).json({ message: "Failed to save chat history.", error: dbError.message });
      }
    } // End of history saving condition

    res.json({ aiResponse: aiResponseText, newChatId: req.newChatId }); // newChatId might be undefined for mallow, which is fine if you don't need it
  } else {
    res.status(500).json({ message: "AI API returned empty response." });
  }
});

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
      'SELECT theme, font_size, ai_model, temperature, daily_message_limit FROM user_settings WHERE username = $1',
      [username]
    );

    // Fetch today's message count for the user
    const today = new Date().toISOString().split("T")[0]; // Get current date in YYYY-MM-DD format
    const messageLog = await pool.query(
      'SELECT message_count FROM user_message_logs WHERE username = $1 AND date = $2',
      [username, today]
    );

    const messageCount = messageLog.rows[0]?.message_count || 0; // Default to 0 if no record exists

    if (settingsResult.rows.length > 0) {
      const settings = settingsResult.rows[0];
      return {
        theme: settings.theme || 'dark',
        font_size: settings.font_size || 16,
        ai_model: settings.ai_model || 'default',
        temperature: settings.temperature || 1.0,
        dailyLimit: settings.daily_message_limit || 100, // Default daily limit
        messageCount: messageCount // Messages used today
      };
    } else {
      // Default settings if no settings found for the user
      return {
        theme: 'dark',
        font_size: 16,
        ai_model: 'default',
        temperature: 1.0,
        dailyLimit: 100, // Default daily limit
        messageCount: messageCount // Messages used today
      };
    }
  } catch (error) {
    console.error("Error fetching user settings:", error);
    return {
      theme: 'dark',
      font_size: 16,
      ai_model: 'default',
      temperature: 1.0,
      dailyLimit: 100, // Default daily limit
      messageCount: 0 // Default to 0 if error occurs
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
router.get('/api/user-settings', validateSessionAndRole("Any"), async (req, res) => {
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
router.post('/api/save-settings', validateSessionAndRole("Any"), async (req, res) => {
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