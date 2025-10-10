import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch';
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";
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
const DEFAULT_DAILY_LIMIT = 100;

// Utility Functions
const formatChatTime = (createdAt) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - createdAt) / 1000);

  if (diffInSeconds < 60) return `${diffInSeconds} second${diffInSeconds > 1 ? 's' : ''} ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minute${Math.floor(diffInSeconds / 60) > 1 ? 's' : ''} ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hour${Math.floor(diffInSeconds / 3600) > 1 ? 's' : ''} ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} day${Math.floor(diffInSeconds / 86400) > 1 ? 's' : ''} ago`;

  return createdAt.toLocaleDateString();
};

const handleApiError = (res, error, context) => {
  console.error(`Error in ${context}:`, error);
  res.status(500).json({
    success: false,
    message: `Error ${context}`,
    error: error.message
  });
};

// Database Operations
const db = {
  fetchChatHistories: async (UserName) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, created_at, temperature FROM ai_history_chatapi WHERE "UserName" = $1 ORDER BY created_at DESC',
        [UserName]
      );

      // Group chats by time period
      const now = new Date();
      const today = new Date(now.setHours(0, 0, 0, 0));
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const groupedChats = {
        today: [],
        yesterday: [],
        last7Days: [],
        last30Days: [],
        older: {}
      };

      // Month-year format for older chats
      const monthYearFormat = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
      });

      rows.forEach(row => {
        const createdAt = new Date(row.created_at);
        const formattedDate = formatChatTime(createdAt);
        const monthYear = monthYearFormat.format(createdAt);

        if (createdAt >= today) {
          groupedChats.today.push({
            id: row.id,
            created_at: formattedDate,
            temperature: row.temperature || 0.5,
            rawDate: createdAt
          });
        } else if (createdAt >= yesterday) {
          groupedChats.yesterday.push({
            id: row.id,
            created_at: formattedDate,
            temperature: row.temperature || 0.5,
            rawDate: createdAt
          });
        } else if (createdAt >= sevenDaysAgo) {
          groupedChats.last7Days.push({
            id: row.id,
            created_at: formattedDate,
            temperature: row.temperature || 0.5,
            rawDate: createdAt
          });
        } else if (createdAt >= thirtyDaysAgo) {
          groupedChats.last30Days.push({
            id: row.id,
            created_at: formattedDate,
            temperature: row.temperature || 0.5,
            rawDate: createdAt
          });
        } else {
          if (!groupedChats.older[monthYear]) {
            groupedChats.older[monthYear] = [];
          }
          groupedChats.older[monthYear].push({
            id: row.id,
            created_at: formattedDate,
            temperature: row.temperature || 0.5,
            rawDate: createdAt
          });
        }
      });

      return groupedChats;
    } catch (error) {
      console.error("Database error fetching chat histories:", error);
      return {
        today: [],
        yesterday: [],
        last7Days: [],
        last30Days: [],
        older: {}
      };
    }
  },

  fetchChatHistoryById: async (chatId) => {
    try {
      // Validate chatId
      if (!chatId || (typeof chatId !== 'string' && typeof chatId !== 'number')) {
        throw new Error('Invalid chat ID');
      }

      const { rows } = await pool.query(
        'SELECT id, conversation_history, temperature FROM ai_history_chatapi WHERE id = $1',
        [chatId]
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Database error fetching chat history:", error);
      return null;
    }
  },

  saveChatHistory: async ({ chatId, history, UserName, temperature }) => {
    try {
      // Validate inputs
      if (!UserName || typeof UserName !== 'string') {
        throw new Error('Invalid UserName');
      }

      if (!history || !Array.isArray(history)) {
        throw new Error('Invalid conversation history');
      }

      if (temperature !== undefined && (isNaN(temperature) || temperature < 0 || temperature > 2)) {
        throw new Error('Invalid temperature value');
      }

      if (chatId) {
        await pool.query(
          'UPDATE ai_history_chatapi SET conversation_history = $1, created_at = CURRENT_TIMESTAMP, temperature = $3 WHERE id = $2',
          [JSON.stringify(history), chatId, temperature]
        );
        return chatId;
      } else {
        const { rows } = await pool.query(
          'INSERT INTO ai_history_chatapi (conversation_history, "UserName", temperature) VALUES ($1, $2, $3) RETURNING id',
          [JSON.stringify(history), UserName, temperature]
        );
        return rows[0].id;
      }
    } catch (error) {
      console.error("Database error saving chat history:", error);
      throw error;
    }
  },

  fetchUserSettings: async (UserName) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const [settingsResult, messageLog] = await Promise.all([
        pool.query(
          'SELECT theme, font_size, ai_model, temperature, daily_message_limit FROM user_settings_chatapi WHERE "UserName" = $1',
          [UserName]
        ),
        pool.query(
          'SELECT message_count FROM user_message_logs_chatapi WHERE "UserName" = $1 AND date = $2',
          [UserName, today]
        )
      ]);

      const messageCount = messageLog.rows[0]?.message_count || 0;

      return settingsResult.rows.length > 0 ? {
        theme: settingsResult.rows[0].theme || DEFAULT_THEME,
        font_size: settingsResult.rows[0].font_size || DEFAULT_FONT_SIZE,
        ai_model: settingsResult.rows[0].ai_model || DEFAULT_MODEL,
        temperature: settingsResult.rows[0].temperature || DEFAULT_TEMPERATURE,
        dailyLimit: settingsResult.rows[0].daily_message_limit || DEFAULT_DAILY_LIMIT,
        messageCount
      } : {
        theme: DEFAULT_THEME,
        font_size: DEFAULT_FONT_SIZE,
        ai_model: DEFAULT_MODEL,
        temperature: DEFAULT_TEMPERATURE,
        dailyLimit: DEFAULT_DAILY_LIMIT,
        messageCount: 0
      };
    } catch (error) {
      console.error("Database error fetching user settings:", error);
      return {
        theme: DEFAULT_THEME,
        font_size: DEFAULT_FONT_SIZE,
        ai_model: DEFAULT_MODEL,
        temperature: DEFAULT_TEMPERATURE,
        dailyLimit: DEFAULT_DAILY_LIMIT,
        messageCount: 0
      };
    }
  },

  saveUserSettings: async (UserName, settings) => {
    try {
      await pool.query(
        `INSERT INTO user_settings_chatapi ("UserName", theme, font_size, ai_model, temperature)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("UserName")
         DO UPDATE SET
            theme = $2,
            font_size = $3,
            ai_model = $4,
            temperature = $5,
            updated_at = CURRENT_TIMESTAMP`,
        [UserName, settings.theme, settings.fontSize, settings.model, settings.temperature]
      );
      return true;
    } catch (error) {
      console.error("Database error saving user settings:", error);
      return false;
    }
  }
};

// AI Service Integrations
const aiServices = {

  formatResponse: (responseText, provider) => {
    // Ensure responseText is a string
    if (typeof responseText !== 'string') {
      console.warn('formatResponse: responseText is not a string, converting...');
      responseText = String(responseText || '');
    }

    // Since we're using proper system messages, we don't need to inject identity here
    return responseText;
  },

  gemini: async (apiKey, model, conversationHistory, temperature) => {
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
    try {
      // Gemini doesn't support system role, so we need to handle it differently
      let systemInstruction = "";
      let filteredHistory = conversationHistory.filter(msg => {
        if (msg.role === 'system') {
          systemInstruction = msg.parts?.[0]?.text || "";
          return false; // Remove system message from history
        }
        return true;
      });

      // If we have a system instruction, prepend it to the first user message
      if (systemInstruction && filteredHistory.length > 0 && filteredHistory[0].role === 'user') {
        filteredHistory[0] = {
          ...filteredHistory[0],
          parts: [{
            text: `${systemInstruction}\n\nUser: ${filteredHistory[0].parts?.[0]?.text || ""}`
          }]
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: filteredHistory,
          generationConfig: { temperature }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error: ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini API";
      return aiServices.formatResponse(responseText, 'gemini');
    } catch (error) {
      console.error("Gemini API error:", error);
      throw error;
    }
  },

  mallow: async (prompt) => {
    const url = "https://literate-slightly-seahorse.ngrok-free.app/generate";
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Mallow API error: ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const responseText = data.response || "No response from Mallow API";
      return aiServices.formatResponse(responseText, 'mallow');
    } catch (error) {
      console.error("Mallow API error:", error);
      return "API service is not available. Please contact [Maaz Waheed](https://github.com/42Wor) to start the API service.";
    }
  },

  nvidia: async (apiKey, model, conversationHistory, temperature) => {
    const url = "https://integrate.api.nvidia.com/v1/chat/completions";

    // Validate inputs
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Invalid NVIDIA API key');
    }

    if (!model || typeof model !== 'string') {
      throw new Error('Invalid model specification');
    }

    if (!Array.isArray(conversationHistory)) {
      throw new Error('Invalid conversation history format');
    }

    const formattedHistory = conversationHistory
      .map(message => ({
        role: message.role === 'model' ? 'assistant' : message.role,
        content: message.parts?.[0]?.text || ''
      }))
      .filter(msg => msg.content && msg.role && ['user', 'assistant', 'system'].includes(msg.role));

    if (formattedHistory.length === 0) {
      throw new Error('No valid messages in conversation history');
    }

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
          temperature,
          top_p: 1.0,
          max_tokens: 4096,
          stream: false
        })
      });

      const responseBody = await response.text();

      if (!response.ok) {
        let errorData = {};
        try {
          errorData = JSON.parse(responseBody);
        } catch (e) {
          errorData = { error: { message: responseBody } };
        }
        throw new Error(`NVIDIA API error: ${errorData.detail || errorData.error?.message || 'Unknown error'}`);
      }

      const data = JSON.parse(responseBody);
      const responseText = data.choices?.[0]?.message?.content || "No response from NVIDIA API";
      return aiServices.formatResponse(responseText, 'nvidia');
    } catch (error) {
      console.error("NVIDIA API error:", error);
      throw error;
    }
  }
};

router.get(["/login", "/signin"], (req, res) => {
  const queryParams = new URLSearchParams(req.query).toString();
  const redirectUrl = `/mbkauthe/login${queryParams ? `?${queryParams}` : ''}`;
  return res.redirect(redirectUrl);
});

router.get(["/chatbot/:chatId?", "/chat/:chatId?"], validateSessionAndRole("Any"), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { UserName, role } = req.session.user;
    const userSettings = await db.fetchUserSettings(UserName);

    res.render('mainPages/chatbot.handlebars', {
      layout: false,
      chatId: chatId || null,
      settings: {
        ...userSettings,
        temperature_value: (userSettings.temperature || DEFAULT_TEMPERATURE).toFixed(1)
      },
      UserName: UserName,
      role
    });
  } catch (error) {
    console.error("Error rendering chatbot page:", error);
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

router.get('/api/chat/histories', validateSessionAndRole("Any"), async (req, res) => {
  try {
    const chatHistories = await db.fetchChatHistories(req.session.user.username);
    res.json(chatHistories);
  } catch (error) {
    handleApiError(res, error, "fetching chat histories");
  }
});

router.get('/api/chat/histories/:chatId', validateSessionAndRole("Any"), async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) return res.status(400).json({ message: "Chat ID is required" });

  try {
    const chatHistory = await db.fetchChatHistoryById(chatId);
    if (chatHistory) {
      // Filter out system messages from the conversation history before sending to frontend
      let conversationHistory = chatHistory.conversation_history;
      if (typeof conversationHistory === 'string') {
        conversationHistory = JSON.parse(conversationHistory);
      }

      // Remove system messages from the conversation history
      const filteredHistory = conversationHistory.filter(msg => msg.role !== 'system');

      // Return the chat history with filtered conversation
      res.json({
        ...chatHistory,
        conversation_history: filteredHistory
      });
    } else {
      res.status(404).json({ message: "Chat history not found" });
    }
  } catch (error) {
    handleApiError(res, error, "fetching chat history by ID");
  }
});

router.post('/api/chat/delete-message/:chatId', validateSessionAndRole("Any"), async (req, res) => {
  const { chatId } = req.params;
  const { messageId } = req.body;

  console.log(`Request received to delete message. Chat ID: ${chatId}, Message ID: ${messageId}`);

  if (!chatId || (typeof chatId !== 'string' && typeof chatId !== 'number')) {
    console.error("Invalid Chat ID in the request");
    return res.status(400).json({ message: "Valid Chat ID is required" });
  }

  if (messageId === undefined || messageId === null) {
    console.error("Message ID is missing in the request");
    return res.status(400).json({ message: "Message ID is required" });
  }

  // Validate messageId is a valid array index
  if (typeof messageId !== 'string' && typeof messageId !== 'number') {
    console.error("Invalid Message ID format");
    return res.status(400).json({ message: "Invalid Message ID format" });
  }

  try {
    console.log(`Fetching chat history for Chat ID: ${chatId}`);
    const chatHistory = await db.fetchChatHistoryById(chatId);
    if (!chatHistory) {
      console.error(`Chat history not found for Chat ID: ${chatId}`);
      return res.status(404).json({ message: "Chat history not found" });
    }

    console.log(`Parsing conversation history for Chat ID: ${chatId}`);
    let conversationHistory;
    try {
      conversationHistory = typeof chatHistory.conversation_history === 'string'
        ? JSON.parse(chatHistory.conversation_history)
        : chatHistory.conversation_history;
    } catch (parseError) {
      console.error(`Error parsing conversation history for Chat ID: ${chatId}`, parseError);
      return res.status(500).json({ message: "Invalid conversation history format" });
    }

    if (!Array.isArray(conversationHistory)) {
      console.error(`Conversation history is not an array for Chat ID: ${chatId}`);
      return res.status(500).json({ message: "Invalid conversation history format" });
    }

    console.log(`Original conversation history length: ${conversationHistory.length}`);

    // Create a filtered version to map frontend indices to actual indices
    const filteredHistory = conversationHistory.filter(msg => msg.role !== 'system');
    const filteredIndex = parseInt(messageId);

    if (isNaN(filteredIndex) || filteredIndex < 0 || filteredIndex >= filteredHistory.length) {
      console.error(`Invalid message ID: ${messageId} for Chat ID: ${chatId}`);
      return res.status(400).json({ message: "Invalid message ID" });
    }

    // Find the actual index in the original conversation history
    const targetMessage = filteredHistory[filteredIndex];
    const actualIndex = conversationHistory.findIndex(msg =>
      msg.role === targetMessage.role &&
      msg.parts?.[0]?.text === targetMessage.parts?.[0]?.text
    );

    if (actualIndex === -1) {
      console.error(`Could not find message to delete for Chat ID: ${chatId}`);
      return res.status(500).json({ message: "Message not found" });
    }

    conversationHistory = conversationHistory.filter((msg, index) => index !== actualIndex);
    console.log(`Updated conversation history length: ${conversationHistory.length}`);

    console.log(`Saving updated conversation history for Chat ID: ${chatId}`);
    await pool.query(
      'UPDATE ai_history_chatapi SET conversation_history = $1 WHERE id = $2',
      [JSON.stringify(conversationHistory), chatId]
    );

    console.log(`Message with ID: ${messageId} successfully deleted from Chat ID: ${chatId}`);
    res.json({ success: true, message: "Message deleted" });
  } catch (error) {
    console.error(`Error deleting message with ID: ${messageId} from Chat ID: ${chatId}`, error);
    handleApiError(res, error, "deleting message");
  }
});

router.post('/api/bot-chat', checkMessageLimit, async (req, res) => {
  const { message, chatId } = req.body;
  const { UserName } = req.session.user;

  // Input validation
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ message: "Message is required and must be a string" });
  }

  if (message.trim().length === 0) {
    return res.status(400).json({ message: "Message cannot be empty" });
  }

  if (message.length > 10000) {
    return res.status(400).json({ message: "Message is too long (max 10000 characters)" });
  }

  if (chatId && (typeof chatId !== 'string' && typeof chatId !== 'number')) {
    return res.status(400).json({ message: "Invalid chat ID format" });
  }

  try {
    // Get user settings
    const userSettings = await db.fetchUserSettings(UserName);
    const temperature = Math.min(Math.max(parseFloat(userSettings.temperature || DEFAULT_TEMPERATURE), 0), 2);

    // Validate temperature
    if (isNaN(temperature)) {
      return res.status(400).json({ message: "Invalid temperature value" });
    }

    // Get conversation history
    let conversationHistory = [];
    if (chatId) {
      const fetchedHistory = await db.fetchChatHistoryById(chatId);
      if (fetchedHistory?.conversation_history) {
        conversationHistory = typeof fetchedHistory.conversation_history === 'string'
          ? JSON.parse(fetchedHistory.conversation_history)
          : fetchedHistory.conversation_history;
      } else if (chatId) {
        return res.status(404).json({ message: "Chat history not found" });
      }
    } else {
      // Add system message for new chats - use proper system role
      conversationHistory.push({
        role: "system",
        parts: [{
          text: "You are an AI chatbot developed by Muhammad Bin Khalid and Maaz Waheed at MBK Tech Studio. You're a general purpose AI assistant (not specifically about MBK Tech Studio). When asked about your identity, mention your developers and that you're a general AI assistant developed at MBK Tech Studio. Keep responses concise and helpful."
        }]
      });
    }

    // Add new user message
    conversationHistory.push({ role: "user", parts: [{ text: message }] });

    // Determine AI provider and model
    const aiModel = userSettings.ai_model || DEFAULT_MODEL;
    const [provider, model] = aiModel.includes('/')
      ? aiModel.split('/', 2)
      : ['gemini', aiModel];

    // Validate provider
    const validProviders = ['gemini', 'nvidia', 'mallow'];
    if (!validProviders.includes(provider.toLowerCase())) {
      return res.status(400).json({ message: "Invalid AI provider" });
    }

    // Call appropriate AI service
    let aiResponseText;
    switch (provider.toLowerCase()) {
      case 'mallow':
        aiResponseText = await aiServices.mallow(message);
        break;
      case 'nvidia':
        const nvidiaApiKey = process.env.NVIDIA_API;
        if (!nvidiaApiKey) throw new Error("NVIDIA API key not configured");
        aiResponseText = await aiServices.nvidia(nvidiaApiKey, userSettings.ai_model, conversationHistory, temperature);
        break;
      case 'gemini':
      default:
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) throw new Error("Gemini API key not configured");
        aiResponseText = await aiServices.gemini(geminiApiKey, model, conversationHistory, temperature);
    }

    // Save conversation if not Mallow
    let newChatId = chatId;
    if (provider !== 'mallow') {
      conversationHistory.push({ role: "model", parts: [{ text: aiResponseText }] });
      newChatId = await db.saveChatHistory({
        chatId,
        history: conversationHistory,
        UserName,
        temperature
      });
    }

    res.json({ aiResponse: aiResponseText, newChatId });
  } catch (error) {
    console.error("Error in bot chat:", error);
    res.status(500).json({
      message: `Error processing ${req.body.provider || 'AI'} request`,
      error: error.message
    });
  }
});

router.post('/api/chat/clear-history/:chatId', validateSessionAndRole("Any"), async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) return res.status(400).json({ message: "Chat ID is required" });

  try {
    await pool.query('DELETE FROM ai_history_chatapi WHERE id = $1', [chatId]);
    res.json({ status: 200, message: "Chat history deleted", chatId });
  } catch (error) {
    handleApiError(res, error, "deleting chat history");
  }
});

router.get('/api/user-settings', validateSessionAndRole("Any"), async (req, res) => {
  try {
    const userSettings = await db.fetchUserSettings(req.session.user.username);
    res.json(userSettings);
  } catch (error) {
    handleApiError(res, error, "fetching user settings");
  }
});

router.post('/api/save-settings', validateSessionAndRole("Any"), async (req, res) => {
  try {
    const { theme, fontSize, model, temperature } = req.body;

    // Validate input
    if (theme && typeof theme !== 'string') {
      return res.status(400).json({ success: false, message: "Invalid theme format" });
    }

    if (fontSize && (typeof fontSize !== 'number' || fontSize < 8 || fontSize > 32)) {
      return res.status(400).json({ success: false, message: "Font size must be between 8 and 32" });
    }

    if (model && typeof model !== 'string') {
      return res.status(400).json({ success: false, message: "Invalid model format" });
    }

    if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
      return res.status(400).json({ success: false, message: "Temperature must be between 0 and 2" });
    }

    const isSaved = await db.saveUserSettings(req.session.user.username, req.body);
    isSaved
      ? res.json({ success: true, message: "Settings saved" })
      : res.status(500).json({ success: false, message: "Failed to save settings" });
  } catch (error) {
    handleApiError(res, error, "saving settings");
  }
});

export default router;