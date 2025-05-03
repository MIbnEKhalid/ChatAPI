import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch';
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";
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
const DEFAULT_DAILY_LIMIT = 100;

// API Clients
let googleAuthError = null;
let serviceusage = null;
let projectId = null;

// Initialize Google Auth
(async () => {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    const authClient = await auth.getClient();
    projectId = await auth.getProjectId();
    serviceusage = google.serviceusage('v1');
  } catch (error) {
    googleAuthError = error;
  }
})();

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
        'SELECT id, created_at, temperature FROM Ai_history WHERE username = $1 ORDER BY created_at DESC',
        [username]
      );
      return rows.map(row => ({
        id: row.id,
        created_at: formatChatTime(new Date(row.created_at)),
        temperature: row.temperature || 0.5
      }));
    } catch (error) {
      console.error("Database error fetching chat histories:", error);
      return [];
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
      console.error("Database error fetching chat history:", error);
      return null;
    }
  },

  saveChatHistory: async ({ chatId, history, username, temperature }) => {
    try {
      if (chatId) {
        await pool.query(
          'UPDATE Ai_history SET conversation_history = $1, created_at = CURRENT_TIMESTAMP, temperature = $3 WHERE id = $2',
          [JSON.stringify(history), chatId, temperature]
        );
        return chatId;
      } else {
        const { rows } = await pool.query(
          'INSERT INTO Ai_history (conversation_history, username, temperature) VALUES ($1, $2, $3) RETURNING id',
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
      const today = new Date().toISOString().split("T")[0];
      const [settingsResult, messageLog] = await Promise.all([
        pool.query(
          'SELECT theme, font_size, ai_model, temperature, daily_message_limit FROM user_settings WHERE username = $1',
          [username]
        ),
        pool.query(
          'SELECT message_count FROM user_message_logs WHERE username = $1 AND date = $2',
          [username, today]
        )
      ]);

      return settingsResult.rows.length > 0 ? {
        theme: settingsResult.rows[0].theme || DEFAULT_THEME,
        font_size: settingsResult.rows[0].font_size || DEFAULT_FONT_SIZE,
        ai_model: settingsResult.rows[0].ai_model || DEFAULT_MODEL,
        temperature: settingsResult.rows[0].temperature || DEFAULT_TEMPERATURE,
        dailyLimit: settingsResult.rows[0].daily_message_limit || DEFAULT_DAILY_LIMIT,
      } : {
        theme: DEFAULT_THEME,
        font_size: DEFAULT_FONT_SIZE,
        ai_model: DEFAULT_MODEL,
        temperature: DEFAULT_TEMPERATURE,
        dailyLimit: DEFAULT_DAILY_LIMIT,
      };
    } catch (error) {
      console.error("Database error fetching user settings:", error);
      return {
        theme: DEFAULT_THEME,
        font_size: DEFAULT_FONT_SIZE,
        ai_model: DEFAULT_MODEL,
        temperature: DEFAULT_TEMPERATURE,
        dailyLimit: DEFAULT_DAILY_LIMIT,
      };
    }
  },

  saveUserSettings: async (username, settings) => {
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
        [username, settings.theme, settings.fontSize, settings.model, settings.temperature]
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
  gemini: async (apiKey, model, conversationHistory, temperature) => {
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: conversationHistory,
          generationConfig: { temperature }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error: ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini API";
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
      return data.response || "No response from Mallow API";
    } catch (error) {
      console.error("Mallow API error:", error);
      return "API service is not available. Please contact [Maaz Waheed](https://github.com/42Wor) to start the API service.";
    }
  },

  nvidia: async (apiKey, model, conversationHistory, temperature) => {
    const url = "https://integrate.api.nvidia.com/v1/chat/completions";
    const formattedHistory = conversationHistory
      .map(message => ({
        role: message.role === 'model' ? 'assistant' : message.role,
        content: message.parts?.[0]?.text || ''
      }))
      .filter(msg => msg.content);

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
      return data.choices?.[0]?.message?.content || "No response from NVIDIA API";
    } catch (error) {
      console.error("NVIDIA API error:", error);
      throw error;
    }
  }
};

router.get(["/login", "/signin"], (req, res) => {
  res.render("staticPage/login.handlebars", {
    userLoggedIn: !!req.session?.user,
    UserName: req.session?.user?.username || ''
  });
});

router.get("/chatbot/:chatId?", validateSessionAndRole("Any"), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { username, role } = req.session.user;
    const userSettings = await db.fetchUserSettings(username);

    res.render('mainPages/chatbot.handlebars', {
      chatId: chatId || null,
      settings: {
        ...userSettings,
        temperature_value: (userSettings.temperature || DEFAULT_TEMPERATURE).toFixed(1)
      },
      UserName: username,
      role,
      userLoggedIn: true
    });
  } catch (error) {
    console.error("Error rendering chatbot page:", error);
    res.status(500).render("templates/Error/500", { error: error.message });
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
    chatHistory
      ? res.json(chatHistory)
      : res.status(404).json({ message: "Chat history not found" });
  } catch (error) {
    handleApiError(res, error, "fetching chat history by ID");
  }
});

router.get('/admin/chatbot/gemini', validateSessionAndRole("SuperAdmin"), async (req, res) => {
  try {
    if (googleAuthError) {
      return res.status(500).render("templates/Error/500", {
        error: "Google API client initialization failed",
        details: googleAuthError.message
      });
    }

    if (!serviceusage || !projectId) {
      return res.status(500).render("templates/Error/500", {
        error: "Google Service Usage client or Project ID not available"
      });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY_maaz_waheed;
    if (!geminiApiKey) {
      return res.status(500).render("templates/Error/500", {
        error: "Gemini API Key not configured"
      });
    }

    const geminiModels = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.5-pro'
    ];

    const modelData = await Promise.all(geminiModels.map(async (model) => {
      try {
        const modelInfoUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${geminiApiKey}`;
        const infoResponse = await fetch(modelInfoUrl);

        if (!infoResponse.ok) {
          return {
            name: model,
            available: false,
            error: `Model info not available (${infoResponse.status})`
          };
        }

        const infoData = await infoResponse.json();
        return {
          name: model,
          available: true,
          description: infoData.description || 'No description',
          inputTokenLimit: infoData.inputTokenLimit || 'Unknown',
          outputTokenLimit: infoData.outputTokenLimit || 'Unknown',
          supportedMethods: infoData.supportedGenerationMethods || [],
          lastTested: new Date().toISOString()
        };
      } catch (error) {
        return {
          name: model,
          available: false,
          error: error.message
        };
      }
    }));

    let quotaInfo = {};
    try {
      const quotas = await serviceusage.services.consumerQuotaMetrics.list({
        parent: `projects/${projectId}/services/generativelanguage.googleapis.com`
      });

      quotaInfo = {
        metrics: quotas.data?.metrics?.map(metric => ({
          displayName: metric.displayName || metric.name || 'Unknown Metric',
          name: metric.name,
          limit: metric.consumerQuotaLimits?.[0]?.quotaBuckets?.[0]?.effectiveLimit || 'N/A',
          usage: metric.consumerQuotaLimits?.[0]?.quotaBuckets?.[0]?.currentUsage || 0,
          percentage: 'N/A' // Calculated in template
        })) || [],
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      quotaInfo = {
        error: true,
        message: "Failed to fetch quota information",
        details: error.message
      };
    }

    res.render("mainPages/geminiDashboard", {
      title: "Gemini API Dashboard",
      models: modelData.filter(m => m.available),
      unavailableModels: modelData.filter(m => !m.available),
      quotaInfo,
      lastUpdated: new Date().toISOString(),
      apiKeyConfigured: !!geminiApiKey,
      googleAuthError: googleAuthError?.message,
      projectId,
      helpers: {
        json: (context) => JSON.stringify(context, null, 2),
        join: (array, separator) => Array.isArray(array) ? array.join(separator) : 'None',
        formatNumber: (num) => (typeof num === 'number' || !isNaN(Number(num)))
          ? Number(num).toLocaleString()
          : num?.toString() || '0',
        findMetric: (metrics, name) => Array.isArray(metrics)
          ? (metrics.find(m => m.name === name) || { name, usage: 'Not found', limit: 'N/A', percentage: 'N/A' })
          : { name, usage: 'Metrics unavailable', limit: 'N/A', percentage: 'N/A' },
        isError: (obj) => obj && obj.error,
        formatDate: (isoString) => isoString ? new Date(isoString).toLocaleString() : 'N/A'
      }
    });
  } catch (error) {
    console.error("Error in Gemini dashboard:", error);
    res.status(500).render("templates/Error/500", {
      error: "Failed to retrieve Gemini API information",
      details: error.message
    });
  }
});

router.post('/api/chat/delete-message/:chatId', validateSessionAndRole("Any"), async (req, res) => {
  const { chatId } = req.params;
  const { messageId } = req.body;

  console.log(`Request received to delete message. Chat ID: ${chatId}, Message ID: ${messageId}`);

  if (!chatId) {
    console.error("Chat ID is missing in the request");
    return res.status(400).json({ message: "Chat ID is required" });
  }
  if (!messageId) {
    console.error("Message ID is missing in the request");
    return res.status(400).json({ message: "Message ID is required" });
  }

  try {
    console.log(`Fetching chat history for Chat ID: ${chatId}`);
    const chatHistory = await db.fetchChatHistoryById(chatId);
    if (!chatHistory) {
      console.error(`Chat history not found for Chat ID: ${chatId}`);
      return res.status(404).json({ message: "Chat history not found" });
    }

    console.log(`Parsing conversation history for Chat ID: ${chatId}`);
    let conversationHistory = typeof chatHistory.conversation_history === 'string'
      ? JSON.parse(chatHistory.conversation_history)
      : chatHistory.conversation_history;

    console.log(`Original conversation history length: ${conversationHistory.length}`);
    conversationHistory = conversationHistory.filter((msg, index) => index.toString() !== messageId);
    console.log(`Updated conversation history length: ${conversationHistory.length}`);

    console.log(`Saving updated conversation history for Chat ID: ${chatId}`);
    await pool.query(
      'UPDATE Ai_history SET conversation_history = $1 WHERE id = $2',
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
  const { username } = req.session.user;

  try {
    // Get user settings
    const userSettings = await db.fetchUserSettings(username);
    const temperature = Math.min(Math.max(parseFloat(userSettings.temperature || DEFAULT_TEMPERATURE), 0), 2);

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
    }

    // Add new user message
    conversationHistory.push({ role: "user", parts: [{ text: message }] });

    // Determine AI provider and model
    const [provider, model] = userSettings.ai_model.includes('/')
      ? userSettings.ai_model.split('/')
      : ['gemini', userSettings.ai_model];

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
        const geminiApiKey = process.env.GEMINI_API_KEY_maaz_waheed;
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
        username,
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
    await pool.query('DELETE FROM Ai_history WHERE id = $1', [chatId]);
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
    const isSaved = await db.saveUserSettings(req.session.user.username, req.body);
    isSaved
      ? res.json({ success: true, message: "Settings saved" })
      : res.status(500).json({ success: false, message: "Failed to save settings" });
  } catch (error) {
    handleApiError(res, error, "saving settings");
  }
});

export default router;