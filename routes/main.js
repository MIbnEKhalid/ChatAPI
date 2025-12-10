import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch'; 
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const router = express.Router();

// Middleware
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// Constants
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
  fetchChatHistories: async (username) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, created_at, temperature FROM ai_history_chatapi WHERE username = $1 ORDER BY created_at DESC',
        [username]
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

      const monthYearFormat = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
      });

      rows.forEach(row => {
        const createdAt = new Date(row.created_at);
        const formattedDate = formatChatTime(createdAt);
        const monthYear = monthYearFormat.format(createdAt);
        const chatObj = {
            id: row.id,
            created_at: formattedDate,
            temperature: row.temperature || 0.5,
            rawDate: createdAt
        };

        if (createdAt >= today) {
          groupedChats.today.push(chatObj);
        } else if (createdAt >= yesterday) {
          groupedChats.yesterday.push(chatObj);
        } else if (createdAt >= sevenDaysAgo) {
          groupedChats.last7Days.push(chatObj);
        } else if (createdAt >= thirtyDaysAgo) {
          groupedChats.last30Days.push(chatObj);
        } else {
          if (!groupedChats.older[monthYear]) {
            groupedChats.older[monthYear] = [];
          }
          groupedChats.older[monthYear].push(chatObj);
        }
      });

      return groupedChats;
    } catch (error) {
      console.error("Database error fetching chat histories:", error);
      return { today: [], yesterday: [], last7Days: [], last30Days: [], older: {} };
    }
  },

  fetchChatHistoryById: async (chatId) => {
    try {
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

  saveChatHistory: async ({ chatId, history, username, temperature }) => {
    try {
      if (!username || typeof username !== 'string') throw new Error('Invalid username');
      if (!history || !Array.isArray(history)) throw new Error('Invalid conversation history');

      if (chatId) {
        await pool.query(
          'UPDATE ai_history_chatapi SET conversation_history = $1, created_at = CURRENT_TIMESTAMP, temperature = $3 WHERE id = $2',
          [JSON.stringify(history), chatId, temperature]
        );
        return chatId;
      } else {
        const { rows } = await pool.query(
          'INSERT INTO ai_history_chatapi (conversation_history, username, temperature) VALUES ($1, $2, $3) RETURNING id',
          [JSON.stringify(history), username, temperature]
        );
        return rows[0].id;
      }
    } catch (error) {
      console.error("Database error saving chat history:", error);
      throw error;
    }
  },

  // ONLY fetches limit and count. No theme/model/font logic here anymore.
  fetchUserLimits: async (username) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const [settingsResult, messageLog] = await Promise.all([
        pool.query(
          'SELECT daily_message_limit FROM user_settings_chatapi WHERE username = $1',
          [username]
        ),
        pool.query(
          'SELECT message_count FROM user_message_logs_chatapi WHERE username = $1 AND date = $2',
          [username, today]
        )
      ]);

      const messageCount = messageLog.rows[0]?.message_count || 0;
      const dailyLimit = settingsResult.rows[0]?.daily_message_limit || DEFAULT_DAILY_LIMIT;

      return { dailyLimit, messageCount };
    } catch (error) {
      console.error("Database error fetching user limits:", error);
      return { dailyLimit: DEFAULT_DAILY_LIMIT, messageCount: 0 };
    }
  }
};

// AI Service Integrations
const aiServices = {
  formatResponse: (responseText, provider) => {
    if (typeof responseText !== 'string') {
      console.warn('formatResponse: responseText is not a string, converting...');
      responseText = String(responseText || '');
    }
    return responseText;
  },

  gemini: async (apiKey, modelName, conversationHistory, temperature) => {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Clean model name if strictly required by SDK, though usually full string is fine
      // But assuming we pass "gemini-1.5-flash" here
      const cleanModelName = modelName.replace(/^models\//, '');
      console.log(`[Gemini] Using model: ${cleanModelName}`);

      let systemInstruction = undefined;
      const historyForSdk = conversationHistory.filter(msg => {
        if (msg.role === 'system') {
          systemInstruction = msg.parts?.[0]?.text || "";
          return false; 
        }
        return true;
      });

      const model = genAI.getGenerativeModel({
        model: cleanModelName,
        systemInstruction: systemInstruction, 
        generationConfig: { temperature: temperature }
      });

      const lastMessage = historyForSdk[historyForSdk.length - 1];
      const previousHistory = historyForSdk.slice(0, -1);

      const chat = model.startChat({
        history: previousHistory,
        generationConfig: { temperature: temperature },
      });

      const result = await chat.sendMessage(lastMessage.parts[0].text);
      const response = await result.response;
      return aiServices.formatResponse(response.text(), 'gemini');

    } catch (error) {
      console.error("Gemini SDK error:", error);
      throw new Error(`Gemini Error: ${error.message}`);
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
      return aiServices.formatResponse(data.response || "No response", 'mallow');
    } catch (error) {
      console.error("Mallow API error:", error);
      return "API service is not available.";
    }
  },

  nvidia: async (apiKey, model, conversationHistory, temperature) => {
    const url = "https://integrate.api.nvidia.com/v1/chat/completions";
    
    // Nvidia expects standard OpenAI format usually
    const formattedHistory = conversationHistory
      .map(message => ({
        role: message.role === 'model' ? 'assistant' : message.role,
        content: message.parts?.[0]?.text || ''
      }))
      .filter(msg => msg.content && msg.role && ['user', 'assistant', 'system'].includes(msg.role));

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
      if (!response.ok) throw new Error(`NVIDIA API error: ${responseBody}`);

      const data = JSON.parse(responseBody);
      return aiServices.formatResponse(data.choices?.[0]?.message?.content || "", 'nvidia');
    } catch (error) {
      console.error("NVIDIA API error:", error);
      throw error;
    }
  }
};

// Routes
router.get(["/login", "/signin"], (req, res) => {
  const queryParams = new URLSearchParams(req.query).toString();
  const redirectUrl = `/mbkauthe/login${queryParams ? `?${queryParams}` : ''}`;
  return res.redirect(redirectUrl);
});

router.get(["/chatbot/:chatId?", "/chat/:chatId?"], validateSessionAndRole("Any"), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { username, role } = req.session.user;
    
    // Only fetch limits, not preferences
    const limits = await db.fetchUserLimits(username);

    res.render('mainPages/chatbot.handlebars', {
      layout: false,
      chatId: chatId || null,
      limits: limits, // Pass limits to frontend
      username: username,
      role
    });
  } catch (error) {
    console.error("Error rendering chatbot page:", error);
    return res.status(500).render("Error/dError.handlebars", {
      layout: false,
      code: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred.",
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
      let conversationHistory = chatHistory.conversation_history;
      if (typeof conversationHistory === 'string') {
        conversationHistory = JSON.parse(conversationHistory);
      }
      const filteredHistory = conversationHistory.filter(msg => msg.role !== 'system');
      res.json({ ...chatHistory, conversation_history: filteredHistory });
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

  if (!chatId) return res.status(400).json({ message: "Valid Chat ID required" });
  if (messageId === undefined) return res.status(400).json({ message: "Message ID required" });

  try {
    const chatHistory = await db.fetchChatHistoryById(chatId);
    if (!chatHistory) return res.status(404).json({ message: "Chat history not found" });

    let conversationHistory = typeof chatHistory.conversation_history === 'string'
      ? JSON.parse(chatHistory.conversation_history)
      : chatHistory.conversation_history;

    // Logic to remove specific message by index (simplified for brevity)
    // Note: In production, relying on array index is risky if concurrent edits happen.
    const filteredHistory = conversationHistory.filter(msg => msg.role !== 'system');
    const filteredIndex = parseInt(messageId);
    
    if (filteredIndex >= 0 && filteredIndex < filteredHistory.length) {
       const targetMsg = filteredHistory[filteredIndex];
       // Find actual index in full history
       const actualIndex = conversationHistory.findIndex(msg => 
          msg.role === targetMsg.role && msg.parts?.[0]?.text === targetMsg.parts?.[0]?.text
       );
       if (actualIndex !== -1) {
          conversationHistory.splice(actualIndex, 1);
          await pool.query(
            'UPDATE ai_history_chatapi SET conversation_history = $1 WHERE id = $2',
            [JSON.stringify(conversationHistory), chatId]
          );
          return res.json({ success: true, message: "Message deleted" });
       }
    }
    res.status(400).json({ message: "Could not delete message" });
  } catch (error) {
    handleApiError(res, error, "deleting message");
  }
});

router.post('/api/bot-chat', checkMessageLimit, async (req, res) => {
  // Extract settings from Request Body (Frontend sends these now)
  const { message, chatId, model: modelString, temperature: tempParam } = req.body;
  const { username } = req.session.user;

  if (!message || !message.trim()) return res.status(400).json({ message: "Message cannot be empty" });
  if (message.length > 10000) return res.status(400).json({ message: "Message too long" });

  try {
    // 1. Process Temperature
    const temperature = tempParam !== undefined 
        ? Math.min(Math.max(parseFloat(tempParam), 0), 2) 
        : 1.0;

    // 2. Process Model String -> Split into Provider and Model Name
    // Expecting format "provider/model-name" e.g., "gemini/gemini-1.5-flash"
    let provider = 'gemini';
    let modelName = 'gemini-1.5-flash'; // Default

    if (modelString && typeof modelString === 'string' && modelString.includes('/')) {
        const splitIndex = modelString.indexOf('/');
        provider = modelString.substring(0, splitIndex);
        modelName = modelString.substring(splitIndex + 1);
    } else if (modelString) {
        // Fallback if no slash provided
        modelName = modelString;
    }

    console.log(`[Bot Chat] User: ${username} | Provider: ${provider} | Model: ${modelName} | Temp: ${temperature}`);

    // 3. Prepare History
    let conversationHistory = [];
    if (chatId) {
      const fetchedHistory = await db.fetchChatHistoryById(chatId);
      if (fetchedHistory?.conversation_history) {
        conversationHistory = typeof fetchedHistory.conversation_history === 'string'
          ? JSON.parse(fetchedHistory.conversation_history)
          : fetchedHistory.conversation_history;
      }
    } else {
      conversationHistory.push({
        role: "system",
        parts: [{ text: "You are an AI chatbot developed by Muhammad Bin Khalid and Maaz Waheed at mbktech.org. Keep responses concise." }]
      });
    }

    conversationHistory.push({ role: "user", parts: [{ text: message }] });

    // 4. Call AI Service
    let aiResponseText;
    switch (provider.toLowerCase()) {
      case 'mallow':
        aiResponseText = await aiServices.mallow(message);
        break;
      case 'nvidia':
        const nvidiaApiKey = process.env.NVIDIA_API;
        if (!nvidiaApiKey) throw new Error("NVIDIA API key not configured");
        aiResponseText = await aiServices.nvidia(nvidiaApiKey, modelName, conversationHistory, temperature);
        break;
      case 'gemini':
      default:
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) throw new Error("Gemini API key not configured");
        aiResponseText = await aiServices.gemini(geminiApiKey, modelName, conversationHistory, temperature);
    }

    // 5. Save History
    let newChatId = chatId;
    if (provider !== 'mallow') {
      conversationHistory.push({ role: "model", parts: [{ text: aiResponseText }] });
      newChatId = await db.saveChatHistory({
        chatId,
        history: conversationHistory,
        username,
        temperature
      });
    }

    res.json({ aiResponse: aiResponseText, newChatId });

  } catch (error) {
    console.error("Error in bot chat:", error);
    res.status(500).json({ message: `Error processing AI request`, error: error.message });
  }
});

router.post('/api/chat/clear-history/:chatId', validateSessionAndRole("Any"), async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) return res.status(400).json({ message: "Chat ID required" });
  try {
    await pool.query('DELETE FROM ai_history_chatapi WHERE id = $1', [chatId]);
    res.json({ status: 200, message: "Chat history deleted", chatId });
  } catch (error) {
    handleApiError(res, error, "deleting chat history");
  }
});

// Removed /api/save-settings route as settings are now local-only

export default router;