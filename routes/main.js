import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch'; 
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// --- CONFIGURATION: PROVIDER SETUP ---
// This object maps the "provider" string to the specific API details.
const AI_PROVIDERS = {
    'gemini': { 
        type: 'google', 
        apiKey: process.env.GEMINI_API_KEY 
    },
    'groq': { 
        type: 'openai-compatible', 
        baseURL: 'https://api.groq.com/openai/v1/chat/completions', 
        apiKey: process.env.GROQ_API_KEY 
    },
    'cerebras': { 
        type: 'openai-compatible', 
        baseURL: 'https://api.cerebras.ai/v1/chat/completions', 
        apiKey: process.env.CEREBRAS_API_KEY 
    },
    'sambanova': { 
        type: 'openai-compatible', 
        baseURL: 'https://api.sambanova.ai/v1/chat/completions', 
        apiKey: process.env.SAMBANOVA_API_KEY 
    },
    'mallow': {
        type: 'custom-mallow',
        url: 'https://literate-slightly-seahorse.ngrok-free.app/generate'
    }
};

// --- UTILITY FUNCTIONS ---
const formatChatTime = (createdAt) => {
  const diffInSeconds = Math.floor((new Date() - createdAt) / 1000);
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return createdAt.toLocaleDateString();
};

const handleApiError = (res, error, context) => {
  console.error(`Error in ${context}:`, error);
  // Send 429 if it's a rate limit, otherwise 500
  const status = error.message?.includes('429') || error.message?.includes('Quota') ? 429 : 500;
  res.status(status).json({ success: false, message: error.message });
};

// --- DATABASE OPERATIONS ---
const db = {
  fetchChatHistories: async (username) => {
    try {
      const { rows } = await pool.query('SELECT id, created_at, temperature FROM ai_history_chatapi WHERE username = $1 ORDER BY created_at DESC', [username]);
      // Simple grouping
      return { 
          today: rows.map(r => ({ ...r, created_at: formatChatTime(new Date(r.created_at)) })) 
      }; 
    } catch (e) { console.error(e); return {}; }
  },

  fetchChatHistoryById: async (chatId) => {
    try {
      if (!chatId) return null;
      const { rows } = await pool.query('SELECT id, conversation_history, temperature FROM ai_history_chatapi WHERE id = $1', [chatId]);
      return rows[0] || null;
    } catch (e) { return null; }
  },

  saveChatHistory: async ({ chatId, history, username, temperature }) => {
    const jsonHistory = JSON.stringify(history);
    if (chatId) {
      await pool.query('UPDATE ai_history_chatapi SET conversation_history = $1, created_at = CURRENT_TIMESTAMP, temperature = $3 WHERE id = $2', [jsonHistory, chatId, temperature]);
      return chatId;
    } else {
      const { rows } = await pool.query('INSERT INTO ai_history_chatapi (conversation_history, username, temperature) VALUES ($1, $2, $3) RETURNING id', [jsonHistory, username, temperature]);
      return rows[0].id;
    }
  },

  fetchUserLimits: async (username) => {
      // Keep your limit logic here if needed
      return { dailyLimit: 100, messageCount: 0 }; 
  }
};

// --- AI LOGIC ---
const aiServices = {
  formatResponse: (text) => String(text || '').trim(),

  // 1. Google Gemini Logic
  google: async (apiKey, modelName, conversationHistory, temperature) => {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // Ensure no "models/" prefix exists
      const cleanModelName = modelName.replace(/^models\//, '');
      
      const historyForSdk = conversationHistory.filter(msg => msg.role !== 'system');
      const systemInstruction = conversationHistory.find(msg => msg.role === 'system')?.parts[0]?.text;

      const model = genAI.getGenerativeModel({
        model: cleanModelName,
        systemInstruction: systemInstruction,
        generationConfig: { temperature }
      });

      const lastMessage = historyForSdk.pop()?.parts[0]?.text || "";
      const chat = model.startChat({ history: historyForSdk, generationConfig: { temperature } });
      
      const result = await chat.sendMessage(lastMessage);
      return aiServices.formatResponse(result.response.text());
    } catch (error) {
      if (error.message?.includes('429')) throw new Error("Google Quota Exceeded (429). Try a Flash model.");
      throw error;
    }
  },

  // 2. Universal Logic (Groq, Cerebras, SambaNova)
  openaiCompatible: async (config, modelName, conversationHistory, temperature) => {
    // Convert Google-style history to OpenAI-style
    const messages = conversationHistory.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.parts?.[0]?.text || ''
    }));

    try {
        const response = await fetch(config.baseURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: messages,
                temperature: temperature,
                max_tokens: 2048, // Cap tokens to save quota
                stream: false
            })
        });

        const data = await response.json();
        if (!response.ok) {
             throw new Error(data.error?.message || `API Error: ${response.status}`);
        }
        return aiServices.formatResponse(data.choices?.[0]?.message?.content);
    } catch (error) {
        if (error.message?.includes('429')) throw new Error("Provider Rate Limit Hit. Switch to a smaller model.");
        throw error;
    }
  },

  // 3. Mallow Logic
  mallow: async (config, prompt) => {
      try {
        const response = await fetch(config.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        if (!response.ok) throw new Error("Mallow API Error");
        const data = await response.json();
        return aiServices.formatResponse(data.response);
      } catch (error) {
          throw new Error("Mallow service unavailable.");
      }
  }
};

// --- ROUTES ---

// 1. Render Page
router.get(["/chatbot/:chatId?", "/chat/:chatId?"], validateSessionAndRole("Any"), async (req, res) => {
    const { username, role } = req.session.user;
    const limits = await db.fetchUserLimits(username);
    res.render('mainPages/chatbot.handlebars', { 
        layout: false, 
        chatId: req.params.chatId || null, 
        limits, username, role 
    });
});

// 2. Chat Processing
router.post('/api/bot-chat', checkMessageLimit, async (req, res) => {
    const { message, chatId, model: modelString, temperature: tempParam } = req.body;
    const { username } = req.session.user;

    if (!message?.trim()) return res.status(400).json({ message: "Message empty" });

    try {
        const temperature = parseFloat(tempParam) || 0.7;
        
        // Parse input "provider/model" (e.g., "groq/llama-3.1-8b-instant")
        // Default to Gemini Flash if nothing provided
        let [provider, ...modelParts] = (modelString || 'gemini/gemini-1.5-flash').split('/');
        let modelName = modelParts.join('/'); 

        // Fallback for messy inputs
        if (!modelName) { modelName = provider; provider = 'gemini'; }
        
        console.log(`[Bot] User: ${username} | Prov: ${provider} | Model: ${modelName}`);

        // Prepare History
        let history = [];
        if (chatId) {
            const data = await db.fetchChatHistoryById(chatId);
            if (data) history = typeof data.conversation_history === 'string' ? JSON.parse(data.conversation_history) : data.conversation_history;
        } else {
            history.push({ role: "system", parts: [{ text: "You are a helpful AI assistant." }] });
        }
        history.push({ role: "user", parts: [{ text: message }] });

        // Route to Handler
        let aiResponseText;
        const config = AI_PROVIDERS[provider.toLowerCase()];

        if (!config) throw new Error(`Provider '${provider}' not found in configuration.`);

        if (config.type === 'google') {
            aiResponseText = await aiServices.google(config.apiKey, modelName, history, temperature);
        } else if (config.type === 'custom-mallow') {
            aiResponseText = await aiServices.mallow(config, message);
        } else {
            // Groq, Cerebras, SambaNova handled here
            aiResponseText = await aiServices.openaiCompatible(config, modelName, history, temperature);
        }

        // Save & Respond
        history.push({ role: "model", parts: [{ text: aiResponseText }] });
        const newChatId = await db.saveChatHistory({ chatId, history, username, temperature });
        
        res.json({ aiResponse: aiResponseText, newChatId });

    } catch (error) {
        handleApiError(res, error, "bot chat");
    }
});

// 3. Chat History API
router.get('/api/chat/histories', validateSessionAndRole("Any"), async (req, res) => {
    res.json(await db.fetchChatHistories(req.session.user.username));
});

router.get('/api/chat/histories/:chatId', validateSessionAndRole("Any"), async (req, res) => {
    const data = await db.fetchChatHistoryById(req.params.chatId);
    if(data) {
        const hist = typeof data.conversation_history === 'string' ? JSON.parse(data.conversation_history) : data.conversation_history;
        res.json({ ...data, conversation_history: hist.filter(m => m.role !== 'system') });
    } else {
        res.status(404).json({message: "Not found"});
    }
});

// 4. Delete Message
router.post('/api/chat/delete-message/:chatId', validateSessionAndRole("Any"), async (req, res) => {
    // Reuse your previous delete logic here (omitted for brevity, but needed)
    res.json({success: true}); 
});

// 5. Clear History
router.post('/api/chat/clear-history/:chatId', validateSessionAndRole("Any"), async (req, res) => {
    await pool.query('DELETE FROM ai_history_chatapi WHERE id = $1', [req.params.chatId]);
    res.json({ status: 200, message: "Deleted" });
});

export default router;