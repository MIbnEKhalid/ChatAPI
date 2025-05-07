import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch';
import { pool } from "./pool.js"; // Assuming pool.js exports your PostgreSQL pool
import { validateSession, validateSessionAndRole } from "mbkauthe"; // Your auth middleware
import { checkMessageLimit } from "./checkMessageLimit.js"; // Your message limit middleware
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

dotenv.config();
const router = express.Router();

// Middleware
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// Constants
const DEFAULT_MODEL = 'gemini/gemini-1.5-flash';
const DEFAULT_TEMPERATURE = 1.0;
const DEFAULT_THEME = 'dark';
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_DAILY_LIMIT = 100; // Example, adjust as needed

// API Clients
let googleAuthError = null;
let serviceusage = null;
let projectId = null;

// Initialize Google Auth (if used for Gemini dashboard or other Google services)
(async () => {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS
      });
      const authClient = await auth.getClient(); // Ensure client can be obtained
      projectId = await auth.getProjectId();
      serviceusage = google.serviceusage({ version: 'v1', auth: authClient }); // Pass authClient
    } catch (error) {
      console.error("Google Auth Initialization Error:", error);
      googleAuthError = error;
    }
  } else {
    console.warn("GOOGLE_APPLICATION_CREDENTIALS not set. Google services requiring auth may not work.");
  }
})();

// Utility Functions
const formatChatTime = (createdAtDate) => {
  if (!(createdAtDate instanceof Date) || isNaN(createdAtDate)) {
      return 'Invalid date';
  }
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - createdAtDate.getTime()) / 1000);

  if (diffInSeconds < 60) return `${diffInSeconds} second${diffInSeconds !== 1 ? 's' : ''} ago`;
  if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }
  if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
  // For more than a day, you might want a different format or just the date
  // For simplicity, let's keep it as days for a bit longer
  if (diffInSeconds < 2592000) { // Approx 30 days
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
  return createdAtDate.toLocaleDateString(); // Or a more specific format
};


const handleApiError = (res, error, context) => {
  console.error(`Error in ${context}:`, error);
  const statusCode = error.statusCode || 500; // Use a custom status code if available
  res.status(statusCode).json({
    success: false,
    message: `Error ${context}: ${error.message || 'An unexpected error occurred.'}`,
    // Optionally include error details in development, but be cautious in production
    ...(process.env.NODE_ENV === 'development' && { errorDetails: error.stack })
  });
};

// Database Operations
const db = {
  fetchChatHistories: async (username) => {
    try {
      // Ensure your Ai_history table has created_at and updated_at columns
      const { rows } = await pool.query(
        'SELECT id, created_at, temperature FROM Ai_history WHERE username = $1 ORDER BY created_at DESC',
        [username]
      );

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(todayStart.getDate() - 1);
      const sevenDaysAgoStart = new Date(todayStart);
      sevenDaysAgoStart.setDate(todayStart.getDate() - 7);
      const thirtyDaysAgoStart = new Date(todayStart);
      thirtyDaysAgoStart.setDate(todayStart.getDate() - 30);

      const groupedChats = {
        today: [],
        yesterday: [],
        last7Days: [],
        last30Days: [],
        older: {} // Changed to object for month-year grouping
      };

      const monthYearFormat = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
      });

      rows.forEach(row => {
        const createdAt = new Date(row.created_at); // Ensure this is a Date object
        const chatItem = {
          id: row.id,
          created_at: formatChatTime(createdAt),
          temperature: row.temperature || DEFAULT_TEMPERATURE, // Use default if null
          rawDate: createdAt // For potential client-side sorting or display
        };

        if (createdAt >= todayStart) {
          groupedChats.today.push(chatItem);
        } else if (createdAt >= yesterdayStart) {
          groupedChats.yesterday.push(chatItem);
        } else if (createdAt >= sevenDaysAgoStart) {
          groupedChats.last7Days.push(chatItem);
        } else if (createdAt >= thirtyDaysAgoStart) {
          groupedChats.last30Days.push(chatItem);
        } else {
          const monthYearKey = monthYearFormat.format(createdAt);
          if (!groupedChats.older[monthYearKey]) {
            groupedChats.older[monthYearKey] = [];
          }
          groupedChats.older[monthYearKey].push(chatItem);
        }
      });
      // Sort older chats within each month by rawDate descending
      for (const monthKey in groupedChats.older) {
        groupedChats.older[monthKey].sort((a, b) => b.rawDate - a.rawDate);
      }

      return groupedChats;
    } catch (error) {
      console.error("Database error fetching chat histories:", error);
      // Return an empty structure or throw the error to be handled by handleApiError
      return { today: [], yesterday: [], last7Days: [], last30Days: [], older: {} };
    }
  },

  fetchChatHistoryById: async (chatId) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, conversation_history, temperature FROM Ai_history WHERE id = $1',
        [chatId]
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Database error fetching chat history by ID:", error);
      throw error; // Let the caller handle it
    }
  },

  saveChatHistory: async ({ chatId, history, username, temperature }) => {
    try {
      if (chatId) {
        // Existing chat, update it
        // Ensure Ai_history has created_at and updated_at columns
        await pool.query(
          'UPDATE Ai_history SET conversation_history = $1, temperature = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [JSON.stringify(history), chatId, temperature]
        );
        return chatId;
      } else {
        // New chat, insert it
        const { rows } = await pool.query(
          'INSERT INTO Ai_history (conversation_history, username, temperature, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id',
          [JSON.stringify(history), username, temperature]
        );
        return rows[0].id;
      }
    } catch (error) {
      console.error("Database error saving chat history:", error);
      throw error;
    }
  },

  fetchUserSettings: async (username) => {
    try {
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const [settingsResult, messageLogResult] = await Promise.all([
        pool.query(
          'SELECT theme, font_size, ai_model, temperature, daily_message_limit FROM user_settings WHERE username = $1',
          [username]
        ),
        pool.query( // Corrected variable name
          'SELECT message_count FROM user_message_logs WHERE username = $1 AND date = $2',
          [username, today]
        )
      ]);

      const messageCount = messageLogResult.rows[0]?.message_count || 0;

      const userSettings = settingsResult.rows[0];
      return {
        theme: userSettings?.theme || DEFAULT_THEME,
        font_size: userSettings?.font_size || DEFAULT_FONT_SIZE,
        ai_model: userSettings?.ai_model || DEFAULT_MODEL,
        temperature: userSettings?.temperature === null || userSettings?.temperature === undefined ? DEFAULT_TEMPERATURE : parseFloat(userSettings.temperature),
        dailyLimit: userSettings?.daily_message_limit || DEFAULT_DAILY_LIMIT,
        messageCount
      };
    } catch (error) {
      console.error("Database error fetching user settings:", error);
      return { // Return defaults on error
        theme: DEFAULT_THEME,
        font_size: DEFAULT_FONT_SIZE,
        ai_model: DEFAULT_MODEL,
        temperature: DEFAULT_TEMPERATURE,
        dailyLimit: DEFAULT_DAILY_LIMIT,
        messageCount: 0
      };
    }
  },

  saveUserSettings: async (username, settings) => {
    try {
      // Ensure settings.temperature is a number
      const temperatureToSave = parseFloat(settings.temperature);
      if (isNaN(temperatureToSave)) {
          throw new Error("Invalid temperature value provided for saving.");
      }

      await pool.query(
        `INSERT INTO user_settings (username, theme, font_size, ai_model, temperature, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (username)
         DO UPDATE SET
            theme = EXCLUDED.theme,
            font_size = EXCLUDED.font_size,
            ai_model = EXCLUDED.ai_model,
            temperature = EXCLUDED.temperature,
            updated_at = CURRENT_TIMESTAMP`,
        [username, settings.theme, settings.fontSize, settings.model, temperatureToSave]
      );
      return true;
    } catch (error) {
      console.error("Database error saving user settings:", error);
      return false; // Or throw error
    }
  }
};

// AI Service Integrations
const aiServices = {
  formatResponse: (responseText, provider) => {
    // This is a simple example; you might want more sophisticated identity detection
    const identityKeywords = ["who are you", "what are you", "your name", "introduce yourself"];
    const lowerResponseText = responseText.toLowerCase();

    if (identityKeywords.some(keyword => lowerResponseText.includes(keyword))) {
      return `I am a general purpose AI assistant. My core functionalities were developed by Muhammad Bin Khalid and Maaz Waheed at MBK Tech Studio. How can I help you today? (Original response: ${responseText})`;
    }
    return responseText;
  },

  gemini: async (apiKey, model, conversationHistory, temperature) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`; // Using v1beta for potentially more features
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: conversationHistory,
          generationConfig: { temperature: parseFloat(temperature) } // Ensure temperature is a float
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        console.error("Gemini API Error Response:", errorData);
        throw new Error(`Gemini API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        console.warn("Gemini API returned no text in response:", data);
        return "I received an empty response. Could you please try rephrasing?";
      }
      return aiServices.formatResponse(responseText, 'gemini');
    } catch (error) {
      console.error("Gemini API call failed:", error);
      throw error; // Re-throw to be handled by the caller
    }
  },

  mallow: async (prompt) => { // Mallow might not support full conversation history or temperature
    const url = "https://literate-slightly-seahorse.ngrok-free.app/generate"; // Replace with actual Mallow endpoint
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }) // Mallow might only take a single prompt
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`Mallow API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const responseText = data.response;
      if (!responseText) {
        return "Mallow API returned no text.";
      }
      return aiServices.formatResponse(responseText, 'mallow');
    } catch (error) {
      console.error("Mallow API call failed:", error);
      // Provide a user-friendly message if Mallow is down
      return "The Mallow API service seems to be unavailable at the moment. Please try another model or contact support.";
    }
  },

  nvidia: async (apiKey, model, conversationHistory, temperature) => {
    const url = "https://integrate.api.nvidia.com/v1/chat/completions";
    // NVIDIA API expects messages in {role: 'user'/'assistant', content: '...'} format
    const formattedHistory = conversationHistory
      .map(message => ({
        role: message.role === 'model' ? 'assistant' : message.role, // Map 'model' to 'assistant'
        content: message.parts?.[0]?.text || ''
      }))
      .filter(msg => msg.content); // Remove empty messages

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: formattedHistory,
          temperature: parseFloat(temperature), // Ensure temperature is a float
          top_p: 1.0, // Common default
          max_tokens: 4096, // Adjust as needed
          stream: false
        })
      });

      const responseBodyText = await response.text(); // Get text first for better error diagnosis

      if (!response.ok) {
        let errorDetail = responseBodyText;
        try {
          const errorJson = JSON.parse(responseBodyText);
          errorDetail = errorJson.detail || errorJson.error?.message || responseBodyText;
        } catch (e) { /* Ignore parsing error, use raw text */ }
        console.error("NVIDIA API Error Response Body:", responseBodyText);
        throw new Error(`NVIDIA API error (${response.status}): ${errorDetail}`);
      }

      const data = JSON.parse(responseBodyText);
      const responseText = data.choices?.[0]?.message?.content;
      if (!responseText) {
        console.warn("NVIDIA API returned no text in response:", data);
        return "I received an empty response from the NVIDIA model. Could you try again?";
      }
      return aiServices.formatResponse(responseText, 'nvidia');
    } catch (error) {
      console.error("NVIDIA API call failed:", error);
      throw error;
    }
  }
};

// --- Routes ---

// Login Route (Example)
router.get(["/login", "/signin"], (req, res) => {
  res.render("staticPage/login.handlebars", { // Adjust template path as needed
    userLoggedIn: !!req.session?.user,
    UserName: req.session?.user?.username || ''
  });
});

// Main Chatbot Page
router.get("/chatbot/:chatId?", validateSessionAndRole("Any"), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { username, role } = req.session.user;
    const userSettings = await db.fetchUserSettings(username);

    res.render('mainPages/chatbot.handlebars', { // Adjust template path
      chatId: chatId || null,
      settings: {
        ...userSettings,
        temperature_value: (userSettings.temperature).toFixed(1) // Ensure temperature is a number
      },
      UserName: username,
      role
    });
  } catch (error) {
    console.error("Error rendering chatbot page:", error);
    res.status(500).render("templates/Error/500.handlebars", { error: error.message }); // Adjust error template
  }
});

// Get all chat histories for the logged-in user
router.get('/api/chat/histories', validateSessionAndRole("Any"), async (req, res) => {
  try {
    const chatHistories = await db.fetchChatHistories(req.session.user.username);
    res.json(chatHistories);
  } catch (error) {
    handleApiError(res, error, "fetching chat histories");
  }
});

// Get a specific chat history by ID
router.get('/api/chat/histories/:chatId', validateSessionAndRole("Any"), async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) {
    return res.status(400).json({ success: false, message: "Chat ID is required" });
  }

  try {
    const chatHistory = await db.fetchChatHistoryById(chatId);
    if (chatHistory) {
      res.json(chatHistory);
    } else {
      res.status(404).json({ success: false, message: "Chat history not found" });
    }
  } catch (error) {
    handleApiError(res, error, "fetching chat history by ID");
  }
});

// Gemini Admin Dashboard (Example - ensure GOOGLE_APPLICATION_CREDENTIALS is set)
router.get('/admin/chatbot/gemini', validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    if (googleAuthError) {
      return res.status(500).render("templates/Error/500.handlebars", {
        error: "Google API client initialization failed",
        details: googleAuthError.message
      });
    }

    if (!serviceusage || !projectId) {
      return res.status(500).render("templates/Error/500.handlebars", {
        error: "Google Service Usage client or Project ID not available. Check GOOGLE_APPLICATION_CREDENTIALS."
      });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY_maaz_waheed; // Or your primary Gemini key
    if (!geminiApiKey) {
      return res.status(500).render("templates/Error/500.handlebars", {
        error: "Gemini API Key (e.g., GEMINI_API_KEY_maaz_waheed) not configured in .env"
      });
    }

    // ... (rest of your Gemini dashboard logic for fetching model info and quotas) ...
    // This part is complex and depends on what you want to show.
    // For brevity, I'll skip the detailed implementation here.
    // You would typically call `serviceusage.services.consumerQuotaMetrics.list`
    // and `fetch` to `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`

    res.render("mainPages/geminiDashboard.handlebars", { // Adjust template path
      title: "Gemini API Dashboard",
      models: [], // Populate with actual model data
      unavailableModels: [], // Populate
      quotaInfo: {}, // Populate
      lastUpdated: new Date().toISOString(),
      apiKeyConfigured: !!geminiApiKey,
      googleAuthError: googleAuthError?.message,
      projectId,
      // ... (your Handlebars helpers)
    });

  } catch (error) {
    console.error("Error in Gemini dashboard:", error);
    res.status(500).render("templates/Error/500.handlebars", {
      error: "Failed to retrieve Gemini API information",
      details: error.message
    });
  }
});

// Delete a specific message from a chat
router.post('/api/chat/delete-message/:chatId', validateSessionAndRole("Any"), async (req, res) => {
  const { chatId } = req.params;
  const { messageIndex } = req.body; // Expecting messageIndex (as a string from JSON)

  console.log(`Request received to delete message. Chat ID: ${chatId}, Message Index: ${messageIndex}`);

  if (!chatId) {
    return res.status(400).json({ success: false, message: "Chat ID is required" });
  }
  if (messageIndex === undefined || messageIndex === null || isNaN(parseInt(messageIndex))) {
    return res.status(400).json({ success: false, message: "Valid Message Index is required" });
  }

  const targetIndex = parseInt(messageIndex);

  try {
    const chatHistoryData = await db.fetchChatHistoryById(chatId);
    if (!chatHistoryData) {
      return res.status(404).json({ success: false, message: "Chat history not found" });
    }

    let conversationHistory = typeof chatHistoryData.conversation_history === 'string'
      ? JSON.parse(chatHistoryData.conversation_history)
      : chatHistoryData.conversation_history;

    if (!Array.isArray(conversationHistory)) {
        console.error(`Conversation history is not an array for Chat ID: ${chatId}`);
        return res.status(500).json({ success: false, message: "Invalid chat history format." });
    }

    if (targetIndex < 0 || targetIndex >= conversationHistory.length) {
        return res.status(400).json({ success: false, message: "Message index out of bounds." });
    }

    conversationHistory.splice(targetIndex, 1); // Remove the message

    // Ensure your Ai_history table has an 'updated_at' column
    await pool.query(
      'UPDATE Ai_history SET conversation_history = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(conversationHistory), chatId]
    );

    res.json({ success: true, message: "Message deleted" });
  } catch (error) {
    // Log the full error for server-side debugging
    console.error(`Error deleting message at index: ${targetIndex} from Chat ID: ${chatId}. DB Error:`, error.message, error.stack);
    // Send a more generic error to the client
    handleApiError(res, error, `deleting message from chat ${chatId}`);
  }
});

// Main AI Chat Endpoint
router.post('/api/bot-chat', checkMessageLimit, async (req, res) => {
  const { message, chatId: requestChatId } = req.body; // Renamed to avoid conflict
  const { username } = req.session.user;
  let currentChatId = requestChatId; // Use this for the current operation

  try {
    const userSettings = await db.fetchUserSettings(username);
    const temperature = Math.min(Math.max(parseFloat(userSettings.temperature), 0), 2); // Clamp temperature

    let conversationHistory = [];
    if (currentChatId) {
      const fetchedHistory = await db.fetchChatHistoryById(currentChatId);
      if (fetchedHistory?.conversation_history) {
        conversationHistory = typeof fetchedHistory.conversation_history === 'string'
          ? JSON.parse(fetchedHistory.conversation_history)
          : fetchedHistory.conversation_history;
      } else if (currentChatId) { // Only error if a specific chatId was given but not found
        return res.status(404).json({ success: false, message: "Chat history not found for the given ID." });
      }
    }

    // Add system message/context for new chats or if history is empty
    if (conversationHistory.length === 0) {
      conversationHistory.push({
        role: "user", // Gemini prefers user/model roles. Some models might use 'system'.
        parts: [{
          text: "SYSTEM CONTEXT: You are a helpful AI assistant. Your core functionalities were developed by Muhammad Bin Khalid and Maaz Waheed at MBK Tech Studio, utilizing APIs including Gemini and NVIDIA. When asked about your identity, you should mention this. Keep responses concise and helpful."
        }]
      });
    }

    conversationHistory.push({ role: "user", parts: [{ text: message }] });

    const [provider, modelNamePart] = userSettings.ai_model.includes('/')
      ? userSettings.ai_model.split('/')
      : ['gemini', userSettings.ai_model]; // Default to gemini if no provider specified

    let aiResponseText;
    const effectiveModel = userSettings.ai_model; // Use the full model string from settings

    switch (provider.toLowerCase()) {
      case 'mallow':
        aiResponseText = await aiServices.mallow(message); // Mallow might only take the last message
        break;
      case 'nvidia':
        const nvidiaApiKey = process.env.NVIDIA_API;
        if (!nvidiaApiKey) throw new Error("NVIDIA API key not configured in .env");
        aiResponseText = await aiServices.nvidia(nvidiaApiKey, effectiveModel, conversationHistory, temperature);
        break;
      case 'gemini':
      default:
        const geminiApiKey = process.env.GEMINI_API_KEY_maaz_waheed; // Or your primary Gemini key
        if (!geminiApiKey) throw new Error("Gemini API key (e.g., GEMINI_API_KEY_maaz_waheed) not configured in .env");
        // For Gemini, modelNamePart would be like 'gemini-1.5-flash'
        aiResponseText = await aiServices.gemini(geminiApiKey, modelNamePart, conversationHistory, temperature);
    }

    // Add AI response to history and save (unless it's a model like Mallow that doesn't use history)
    if (provider.toLowerCase() !== 'mallow') { // Example: Mallow might be stateless
        conversationHistory.push({ role: "model", parts: [{ text: aiResponseText }] });
        currentChatId = await db.saveChatHistory({ // saveChatHistory returns the ID (new or existing)
            chatId: currentChatId,
            history: conversationHistory,
            username,
            temperature
        });
    }

    res.json({ success: true, aiResponse: aiResponseText, newChatId: currentChatId });
  } catch (error) {
    console.error("Error in /api/bot-chat:", error);
    // Provide a more user-friendly error message
    let clientErrorMessage = "An error occurred while processing your request with the AI.";
    if (error.message.includes("API key not configured")) {
        clientErrorMessage = "The AI service is not configured correctly. Please contact support.";
    } else if (error.message.includes("API error")) {
        clientErrorMessage = "There was an issue communicating with the AI service. Please try again later.";
    }
    res.status(500).json({
      success: false,
      message: clientErrorMessage,
      // Optionally, include more details in development
      ...(process.env.NODE_ENV === 'development' && { errorDetails: error.message })
    });
  }
});

// Delete an entire chat history
router.post('/api/chat/clear-history/:chatId', validateSessionAndRole("Any"), async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) {
    return res.status(400).json({ success: false, message: "Chat ID is required" });
  }

  try {
    // You might want to check if the chat belongs to the user before deleting
    // For now, assuming any authenticated user can clear if they have the ID (consider security implications)
    const result = await pool.query('DELETE FROM Ai_history WHERE id = $1 AND username = $2', [chatId, req.session.user.username]);
    if (result.rowCount > 0) {
        res.json({ success: true, message: "Chat history deleted", chatId });
    } else {
        res.status(404).json({ success: false, message: "Chat history not found or you do not have permission to delete it."});
    }
  } catch (error) {
    handleApiError(res, error, "deleting chat history");
  }
});

// Get user settings
router.get('/api/user-settings', validateSessionAndRole("Any"), async (req, res) => {
  try {
    const userSettings = await db.fetchUserSettings(req.session.user.username);
    res.json({ success: true, settings: userSettings });
  } catch (error) {
    handleApiError(res, error, "fetching user settings");
  }
});

// Save user settings
router.post('/api/save-settings', validateSessionAndRole("Any"), async (req, res) => {
  try {
    // Basic validation for settings
    const { theme, fontSize, model, temperature } = req.body;
    if (!theme || !fontSize || !model || temperature === undefined || temperature === null) {
        return res.status(400).json({ success: false, message: "Missing required settings fields."});
    }
    if (isNaN(parseFloat(temperature)) || parseFloat(temperature) < 0 || parseFloat(temperature) > 2) {
        return res.status(400).json({ success: false, message: "Temperature must be a number between 0 and 2."});
    }
    if (isNaN(parseInt(fontSize)) || parseInt(fontSize) < 10 || parseInt(fontSize) > 30) { // Example font size range
        return res.status(400).json({ success: false, message: "Font size is out of allowed range."});
    }


    const isSaved = await db.saveUserSettings(req.session.user.username, req.body);
    if (isSaved) {
      res.json({ success: true, message: "Settings saved" });
    } else {
      // db.saveUserSettings should ideally throw an error if it fails,
      // which would be caught by the catch block.
      // This else is a fallback if it returns false without throwing.
      res.status(500).json({ success: false, message: "Failed to save settings due to an unknown database error." });
    }
  } catch (error) {
    handleApiError(res, error, "saving settings");
  }
});

export default router;