import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch';
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";

dotenv.config();
const router = express.Router();

// Constants
const DEFAULT_MODEL = 'gemini/gemini-1.5-flash';
const DEFAULT_TEMPERATURE = 1.0;
const DEFAULT_THEME = 'dark';
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_DAILY_LIMIT = 100;
const DEFAULT_PAGE_SIZE = 20;
const IDENTITY_QUESTIONS = [
  /who\s*(are|is)\s*you/i,
  /what\s*(are|is)\s*you/i,
  /your\s*(name|identity)/i,
  /introduce\s*yourself/i,
  /are\s*you\s*(chatgpt|gemini|ai|bot)/i
];

// Middleware
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// Utility Functions
const formatChatTime = (createdAt) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - createdAt) / 1000);

  const intervals = [
    { seconds: 60, text: 'second' },
    { seconds: 3600, text: 'minute', divisor: 60 },
    { seconds: 86400, text: 'hour', divisor: 3600 },
    { seconds: 2592000, text: 'day', divisor: 86400 }
  ];

  for (const interval of intervals) {
    if (diffInSeconds < interval.seconds) {
      const value = Math.floor(diffInSeconds / (interval.divisor || 1));
      return `${value} ${interval.text}${value > 1 ? 's' : ''} ago`;
    }
  }

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

const isIdentityQuestion = (text) =>
  IDENTITY_QUESTIONS.some(regex => regex.test(text));

// Database Operations
const db = {
  fetchChatHistories: async (username, page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
    const offset = (page - 1) * pageSize;
    const monthYearFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long' });

    try {
      const [countResult, chatResult] = await Promise.all([
        pool.query(
          'SELECT COUNT(*) FROM ai_history_chatapi WHERE username = $1',
          [username]
        ),
        pool.query(
          `SELECT id, created_at, temperature 
           FROM ai_history_chatapi 
           WHERE username = $1 
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [username, pageSize, offset]
        )
      ]);

      const totalCount = parseInt(countResult.rows[0].count);
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
        older: {},
        pagination: {
          currentPage: page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize)
        }
      };

      chatResult.rows.forEach(row => {
        const createdAt = new Date(row.created_at);
        const formattedDate = formatChatTime(createdAt);
        const chatItem = {
          id: row.id,
          created_at: formattedDate,
          temperature: row.temperature || 0.5,
          rawDate: createdAt
        };

        if (createdAt >= today) {
          groupedChats.today.push(chatItem);
        } else if (createdAt >= yesterday) {
          groupedChats.yesterday.push(chatItem);
        } else if (createdAt >= sevenDaysAgo) {
          groupedChats.last7Days.push(chatItem);
        } else if (createdAt >= thirtyDaysAgo) {
          groupedChats.last30Days.push(chatItem);
        } else {
          const monthYear = monthYearFormat.format(createdAt);
          groupedChats.older[monthYear] = groupedChats.older[monthYear] || [];
          groupedChats.older[monthYear].push(chatItem);
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
        older: {},
        pagination: {
          currentPage: 1,
          pageSize: DEFAULT_PAGE_SIZE,
          totalCount: 0,
          totalPages: 0
        }
      };
    }
  },

  fetchChatHistoryById: async (chatId) => {
    try {
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
      if (chatId) {
        await pool.query(
          'UPDATE ai_history_chatapi SET conversation_history = $1, created_at = CURRENT_TIMESTAMP, temperature = $3 WHERE id = $2',
          [JSON.stringify(history), chatId, temperature]
        );
        return chatId;
      }

      const { rows } = await pool.query(
        'INSERT INTO ai_history_chatapi (conversation_history, username, temperature) VALUES ($1, $2, $3) RETURNING id',
        [JSON.stringify(history), username, temperature]
      );
      return rows[0].id;
    } catch (error) {
      console.error("Database error saving chat history:", error);
      throw error;
    }
  },

  fetchUserSettings: async (username) => {
    const today = new Date().toISOString().split("T")[0];
    const defaultSettings = {
      theme: DEFAULT_THEME,
      font_size: DEFAULT_FONT_SIZE,
      ai_model: DEFAULT_MODEL,
      temperature: DEFAULT_TEMPERATURE,
      dailyLimit: DEFAULT_DAILY_LIMIT,
      messageCount: 0
    };

    try {
      const [settingsResult, messageLog] = await Promise.all([
        pool.query(
          'SELECT theme, font_size, ai_model, temperature, daily_message_limit FROM user_settings_chatapi WHERE username = $1',
          [username]
        ),
        pool.query(
          'SELECT message_count FROM user_message_logs_chatapi WHERE username = $1 AND date = $2',
          [username, today]
        )
      ]);

      if (settingsResult.rows.length === 0) {
        return defaultSettings;
      }

      return {
        ...defaultSettings,
        ...settingsResult.rows[0],
        messageCount: messageLog.rows[0]?.message_count || 0
      };
    } catch (error) {
      console.error("Database error fetching user settings:", error);
      return defaultSettings;
    }
  },

  saveUserSettings: async (username, settings) => {
    try {
      await pool.query(
        `INSERT INTO user_settings_chatapi (username, theme, font_size, ai_model, temperature)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username)
         DO UPDATE SET
            theme = EXCLUDED.theme,
            font_size = EXCLUDED.font_size,
            ai_model = EXCLUDED.ai_model,
            temperature = EXCLUDED.temperature,
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
  formatResponse: (responseText) => {
    if (isIdentityQuestion(responseText)) {
      return `I'm a general purpose AI assistant developed by Muhammad Bin Khalid and Maaz Waheed at MBK Tech Studio. How can I help you today? ${responseText}`;
    }
    return responseText;
  },

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
        const errorMessage = errorData.error?.message || 'Unknown error';

        if (errorMessage.includes('You exceeded your current quota')) {
          return `The Quota for the Gemini model "${model}" has been exceeded. Please select a different model and try again.`;
        }

        throw new Error(`Gemini API error: ${errorMessage}`);
      }

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini API";
      return aiServices.formatResponse(responseText);
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
      return aiServices.formatResponse(responseText);
    } catch (error) {
      console.error("Mallow API error:", error);
      return "API service is not available. Please contact [Maaz Waheed](https://github.com/42Wor) to start the API service.";
    }
  },

  nvidia: async (apiKey, model, conversationHistory) => {
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
          temperature: 0.5,
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
      return aiServices.formatResponse(responseText);
    } catch (error) {
      console.error("NVIDIA API error:", error);
      throw error;
    }
  }
};

// Routes
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
      role
    });
  } catch (error) {
    console.error("Error rendering chatbot page:", error);
    res.status(500).render("templates/Error/500", { error: error.message });
  }
});

router.get('/api/chat/histories', validateSessionAndRole("Any"), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || DEFAULT_PAGE_SIZE;

    const chatHistories = await db.fetchChatHistories(
      req.session.user.username,
      page,
      pageSize
    );

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
    if (!chatHistory) {
      return res.status(404).json({ message: "Chat history not found" });
    }
    res.json(chatHistory);
  } catch (error) {
    handleApiError(res, error, "fetching chat history by ID");
  }
});

router.post('/api/chat/delete-message/:chatId', validateSessionAndRole("Any"), async (req, res) => {
  const { chatId } = req.params;
  const { messageId } = req.body;

  if (!chatId || !messageId) {
    return res.status(400).json({
      message: "Chat ID and Message ID are required"
    });
  }

  try {
    const chatHistory = await db.fetchChatHistoryById(chatId);
    if (!chatHistory) {
      return res.status(404).json({ message: "Chat history not found" });
    }

    let conversationHistory = typeof chatHistory.conversation_history === 'string'
      ? JSON.parse(chatHistory.conversation_history)
      : chatHistory.conversation_history;

    conversationHistory = conversationHistory.filter((_, index) =>
      index.toString() !== messageId
    );

    await pool.query(
      'UPDATE ai_history_chatapi SET conversation_history = $1 WHERE id = $2',
      [JSON.stringify(conversationHistory), chatId]
    );

    res.json({ success: true, message: "Message deleted" });
  } catch (error) {
    console.error(`Error deleting message from chat ${chatId}:`, error);
    handleApiError(res, error, "deleting message");
  }
});

router.post('/api/bot-chat', checkMessageLimit, async (req, res) => {
  const { message, chatId } = req.body;
  const { username } = req.session.user;

  try {
    const userSettings = await db.fetchUserSettings(username);
    const temperature = Math.min(Math.max(parseFloat(userSettings.temperature || DEFAULT_TEMPERATURE), 0), 2);
    const [provider, model] = userSettings.ai_model.includes('/')
      ? userSettings.ai_model.split('/')
      : ['gemini', userSettings.ai_model];

    let conversationHistory = [];
    if (chatId) {
      const fetchedHistory = await db.fetchChatHistoryById(chatId);
      if (!fetchedHistory && chatId) {
        return res.status(404).json({ message: "Chat history not found" });
      }
      if (fetchedHistory?.conversation_history) {
        conversationHistory = typeof fetchedHistory.conversation_history === 'string'
          ? JSON.parse(fetchedHistory.conversation_history)
          : fetchedHistory.conversation_history;
      }
    } else {
      conversationHistory.push({
        role: "user",
        parts: [{
          text: "IMPORTANT CONTEXT: You are an AI chatbot developed by Muhammad Bin Khalid and Maaz Waheed at MBK Tech Studio. You're a general purpose chatbot (not specifically about MBK Tech Studio). When asked about your identity, mention your developers and that you're a general AI assistant developed at MBK Tech Studio."
        }]
      });
    }

    conversationHistory.push({ role: "user", parts: [{ text: message }] });

    let aiResponseText;
    switch (provider.toLowerCase()) {
      case 'mallow':
        aiResponseText = await aiServices.mallow(message);
        break;
      case 'nvidia':
        if (!process.env.NVIDIA_API) {
          throw new Error("NVIDIA API key not configured");
        }
        aiResponseText = await aiServices.nvidia(
          process.env.NVIDIA_API,
          userSettings.ai_model,
          conversationHistory
        );
        break;
      case 'gemini':
      default:
        if (!process.env.GEMINI_API_KEY_maaz_waheed) {
          throw new Error("Gemini API key not configured");
        }
        aiResponseText = await aiServices.gemini(
          process.env.GEMINI_API_KEY_maaz_waheed,
          model,
          conversationHistory,
          temperature
        );
    }

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
    const success = await db.saveUserSettings(req.session.user.username, req.body);
    res.json({
      success,
      message: success ? "Settings saved" : "Failed to save settings"
    });
  } catch (error) {
    handleApiError(res, error, "saving settings");
  }
});

router.get('/admin/chatbot/gemini', validateSessionAndRole("SuperAdmin"), async (_, res) => {
  try {
    const projectId = "mbktechstudiofilestorage"; // Ensure this environment variable is set

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

export default router;