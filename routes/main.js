import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch';
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from 'crypto'; 

dotenv.config();
const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// --- 1. CONFIGURATION ---
const AI_PROVIDERS = {
    'gemini': { 
        type: 'google', 
        apiKey: process.env.GEMINI_API_KEY 
    },
    'groq': { 
        type: 'openai', 
        baseURL: 'https://api.groq.com/openai/v1/chat/completions', 
        apiKey: process.env.GROQ_API_KEY 
    },
    'cerebras': { 
        type: 'openai', 
        baseURL: 'https://api.cerebras.ai/v1/chat/completions', 
        apiKey: process.env.CEREBRAS_API_KEY 
    },
    'sambanova': { 
        type: 'openai', 
        baseURL: 'https://api.sambanova.ai/v1/chat/completions', 
        apiKey: process.env.SAMBANOVA_API_KEY 
    },
    'mallow': { 
        type: 'mallow', 
        url: 'https://literate-slightly-seahorse.ngrok-free.app/generate' 
    }
};

// --- 2. TREE LOGIC HELPER ---
class ChatTree {
    constructor(data) {
        if (Array.isArray(data)) {
            // Convert legacy linear array to tree structure
            this.nodes = {};
            this.rootId = null;
            let parentId = null;
            data.forEach(msg => {
                const id = crypto.randomUUID();
                if (!this.rootId) this.rootId = id;
                this.nodes[id] = { 
                    id, 
                    parentId, 
                    children: [], 
                    role: msg.role, 
                    text: msg.parts ? msg.parts[0].text : msg.text, 
                    createdAt: Date.now() 
                };
                if (parentId && this.nodes[parentId]) {
                    this.nodes[parentId].children.push(id);
                }
                parentId = id;
            });
            this.currentLeafId = parentId;
        } else if (data && data.nodes) {
            // Load existing tree
            this.nodes = data.nodes;
            this.rootId = data.rootId;
            this.currentLeafId = data.currentLeafId;
        } else {
            // New Tree
            this.nodes = {};
            this.rootId = null;
            this.currentLeafId = null;
        }
    }

    addMessage(role, text, parentId) {
        const id = crypto.randomUUID();
        const node = { id, parentId, children: [], role, text, createdAt: Date.now() };
        this.nodes[id] = node;
        
        if (!this.rootId) this.rootId = id;
        if (parentId && this.nodes[parentId]) {
            this.nodes[parentId].children.push(id);
        }
        this.currentLeafId = id; 
        return id;
    }

    // Convert branch back to linear history for AI context
    getThread(leafId) {
        let thread = [];
        let curr = leafId || this.currentLeafId;
        while (curr && this.nodes[curr]) {
            thread.unshift({ 
                role: this.nodes[curr].role, 
                parts: [{ text: this.nodes[curr].text }] 
            });
            curr = this.nodes[curr].parentId;
        }
        return thread;
    }

    toJSON() {
        return { nodes: this.nodes, rootId: this.rootId, currentLeafId: this.currentLeafId };
    }
}

// --- 3. AI HANDLERS ---
const aiServices = {
    formatResponse: (text) => String(text || '').trim(),

    google: async (apiKey, model, history, temp) => {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const cleanModel = model.replace(/^models\//, '');
            const modelInstance = genAI.getGenerativeModel({ model: cleanModel, generationConfig: { temperature: temp } });
            
            // Separate System Prompt
            const historyForSdk = history.filter(m => m.role !== 'system');
            const systemMsg = history.find(m => m.role === 'system');
            
            if(systemMsg) {
                modelInstance.systemInstruction = { parts: [{ text: systemMsg.parts[0].text }] };
            }

            const lastMsg = historyForSdk.pop().parts[0].text;
            const chat = modelInstance.startChat({ history: historyForSdk, generationConfig: { temperature: temp } });
            const result = await chat.sendMessage(lastMsg);
            return aiServices.formatResponse(result.response.text());
        } catch (e) { 
            throw new Error(e.message.includes('429') ? "Gemini Rate Limit (429)" : e.message); 
        }
    },

    openaiCompatible: async (config, model, history, temp) => {
        const messages = history.map(m => ({ 
            role: m.role === 'model' ? 'assistant' : m.role, 
            content: m.parts[0].text 
        }));
        
        try {
            const res = await fetch(config.baseURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
                body: JSON.stringify({ 
                    model, 
                    messages, 
                    temperature: temp, 
                    max_tokens: 2048, 
                    stream: false 
                })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || `API Error ${res.status}`);
            return aiServices.formatResponse(data.choices[0].message.content);
        } catch (e) { 
            throw new Error(e.message.includes('429') ? "Provider Rate Limit (429)" : e.message); 
        }
    },

    mallow: async (config, prompt) => {
        try {
            const res = await fetch(config.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            const data = await res.json();
            return aiServices.formatResponse(data.response);
        } catch (e) { throw new Error("Mallow API unavailable"); }
    }
};

// --- 4. DATABASE OPERATIONS ---
const db = {
    // UPDATED: Filter by is_deleted = FALSE
    getChat: async (id) => {
        const res = await pool.query('SELECT * FROM ai_history_chatapi WHERE id = $1 AND is_deleted = FALSE', [id]);
        return res.rows[0];
    },
    
    // UPDATED: Removed Temperature Column, Updates Updated_at
    saveChat: async (id, treeData, username) => {
        const json = JSON.stringify(treeData);
        if (id) {
            await pool.query('UPDATE ai_history_chatapi SET conversation_history = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [json, id]);
            return id;
        } else {
            const res = await pool.query('INSERT INTO ai_history_chatapi (conversation_history, username) VALUES ($1, $2) RETURNING id', [json, username]);
            return res.rows[0].id;
        }
    },
    
    // Mock Limits (Connect to your real tables if needed)
    getLimits: async (username) => {
        try {
             const today = new Date().toISOString().split("T")[0];
             const [settings, logs] = await Promise.all([
                 pool.query('SELECT daily_message_limit FROM user_settings_chatapi WHERE username = $1', [username]).catch(() => ({rows:[]})),
                 pool.query('SELECT message_count FROM user_message_logs_chatapi WHERE username = $1 AND date = $2', [username, today]).catch(() => ({rows:[]}))
             ]);
             return { 
                 dailyLimit: settings.rows[0]?.daily_message_limit || 100, 
                 messageCount: logs.rows[0]?.message_count || 0 
             };
        } catch (e) {
            return { dailyLimit: 100, messageCount: 0 }; 
        }
    }
};

// --- 5. ROUTES ---

// Render Page
router.get(["/chatbot/:chatId?", "/chat/:chatId?"], validateSessionAndRole("Any"), async (req, res) => {
    try {
        const limits = await db.getLimits(req.session.user.username);
        res.render('mainPages/chatbot.handlebars', { 
            layout: false, 
            chatId: req.params.chatId || null, 
            username: req.session.user.username, 
            role: req.session.user.role,
            limits 
        });
    } catch (error) {
        res.send("Error loading chat interface.");
    }
});

// Load Chat API (Returns Full Tree)
router.get('/api/chat/histories/:chatId', validateSessionAndRole("Any"), async (req, res) => {
    const chat = await db.getChat(req.params.chatId);
    if (!chat) return res.status(404).json({ message: "Not found" });
    
    // Parse tree
    let history = typeof chat.conversation_history === 'string' ? JSON.parse(chat.conversation_history) : chat.conversation_history;
    const tree = new ChatTree(history); 
    
    res.json({ ...chat, treeData: tree.toJSON() });
});

// Main Chat Processing Route
router.post('/api/bot-chat', checkMessageLimit, async (req, res) => {
    const { message, chatId, parentMessageId, model: modelStr, temperature: tempParam } = req.body;
    const { username } = req.session.user;

    if (!message?.trim()) return res.status(400).json({ message: "Empty message" });

    try {
        const temp = parseFloat(tempParam) || 0.7;
        
        // Model Parsing
        let [provider, ...modelParts] = (modelStr || 'gemini/gemini-1.5-flash').split('/');
        let modelName = modelParts.join('/') || provider;
        if(modelParts.length === 0) provider = 'gemini';

        // 1. Load Tree or Init New
        let tree;
        let dbId = chatId;
        
        if (dbId) {
            const chat = await db.getChat(dbId);
            if(chat) {
                const rawData = typeof chat.conversation_history === 'string' ? JSON.parse(chat.conversation_history) : chat.conversation_history;
                tree = new ChatTree(rawData);
            } else {
                // ID provided but not found (deleted?), treat as new
                tree = new ChatTree(null);
                dbId = null; 
            }
        } else {
            tree = new ChatTree(null);
            tree.addMessage('system', "You are a helpful AI assistant. Be concise.", null);
        }

        // 2. Add User Node
        // If parentMessageId exists (Editing/Branching), use it. Else use current leaf.
        const parentId = parentMessageId || tree.currentLeafId;
        const userNodeId = tree.addMessage('user', message, parentId);

        // 3. Get Context for AI (Linear History from User Node up to Root)
        const historyForAI = tree.getThread(userNodeId);

        // 4. Generate AI Response
        const config = AI_PROVIDERS[provider.toLowerCase()];
        if (!config) throw new Error("Invalid Provider Configuration");

        let responseText;
        if (config.type === 'google') {
            responseText = await aiServices.google(config.apiKey, modelName, historyForAI, temp);
        } else if (config.type === 'mallow') {
            responseText = await aiServices.mallow(config, message);
        } else {
            responseText = await aiServices.openaiCompatible(config, modelName, historyForAI, temp);
        }

        // 5. Add AI Node (Child of User Node)
        tree.addMessage('model', responseText, userNodeId);

        // 6. Save (No Temperature Column)
        const newChatId = await db.saveChat(dbId, tree.toJSON(), username);

        res.json({ 
            aiResponse: responseText, 
            newChatId, 
            treeData: tree.toJSON() 
        });

    } catch (error) {
        console.error("Chat Error:", error);
        // Handle Rate Limits specially
        const status = error.message.includes('429') ? 429 : 500;
        res.status(status).json({ message: error.message });
    }
});

// Soft Delete (Set is_deleted = TRUE)
router.post('/api/chat/clear-history/:chatId', validateSessionAndRole("Any"), async (req, res) => {
    try {
        await pool.query('UPDATE ai_history_chatapi SET is_deleted = TRUE WHERE id = $1', [req.params.chatId]);
        res.json({ success: true, message: "Chat moved to trash" });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Fetch List (Filter is_deleted = FALSE)
router.get('/api/chat/histories', validateSessionAndRole("Any"), async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, created_at FROM ai_history_chatapi WHERE username = $1 AND is_deleted = FALSE ORDER BY updated_at DESC', 
            [req.session.user.username]
        );
        
        // Grouping
        const grouped = { today: [], yesterday: [], older: [] };
        const now = new Date();
        const today = new Date(now.setHours(0,0,0,0));
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

        rows.forEach(r => {
            const d = new Date(r.created_at);
            const dTime = new Date(d).setHours(0,0,0,0);
            
            const obj = { id: r.id, created_at: d.toLocaleDateString() };
            
            if (dTime === today.getTime()) grouped.today.push(obj);
            else if (dTime === yesterday.getTime()) grouped.yesterday.push(obj);
            else grouped.older.push(obj);
        });
        
        res.json(grouped);
    } catch (e) {
        res.status(500).json({ message: "Error loading list" });
    }
});

export default router;