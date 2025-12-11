import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch';
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from 'crypto'; // For generating unique Message IDs

dotenv.config();
const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// --- CONFIGURATION ---
const AI_PROVIDERS = {
    'gemini': { type: 'google', apiKey: process.env.GEMINI_API_KEY },
    'groq': { type: 'openai', baseURL: 'https://api.groq.com/openai/v1/chat/completions', apiKey: process.env.GROQ_API_KEY },
    'cerebras': { type: 'openai', baseURL: 'https://api.cerebras.ai/v1/chat/completions', apiKey: process.env.CEREBRAS_API_KEY },
    'sambanova': { type: 'openai', baseURL: 'https://api.sambanova.ai/v1/chat/completions', apiKey: process.env.SAMBANOVA_API_KEY },
    'mallow': { type: 'mallow', url: 'https://literate-slightly-seahorse.ngrok-free.app/generate' }
};

// --- TREE LOGIC HELPER ---
// Manages the branching conversation structure
class ChatTree {
    constructor(data) {
        // If data is old array format, convert to tree
        if (Array.isArray(data)) {
            this.nodes = {};
            this.rootId = null;
            let parentId = null;
            data.forEach(msg => {
                const id = crypto.randomUUID();
                if (!this.rootId) this.rootId = id;
                this.nodes[id] = { id, parentId, children: [], role: msg.role, text: msg.parts[0].text, createdAt: Date.now() };
                if (parentId) this.nodes[parentId].children.push(id);
                parentId = id;
            });
            this.currentLeafId = parentId; // The last message is the leaf
        } else if (data && data.nodes) {
            this.nodes = data.nodes;
            this.rootId = data.rootId;
            this.currentLeafId = data.currentLeafId;
        } else {
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
        this.currentLeafId = id; // Update pointer to this new message
        return id;
    }

    // Traces back from a leaf ID to the root to build the conversation context for AI
    getThread(leafId) {
        let thread = [];
        let curr = leafId || this.currentLeafId;
        while (curr && this.nodes[curr]) {
            thread.unshift({ role: this.nodes[curr].role, parts: [{ text: this.nodes[curr].text }] });
            curr = this.nodes[curr].parentId;
        }
        return thread;
    }

    toJSON() {
        return { nodes: this.nodes, rootId: this.rootId, currentLeafId: this.currentLeafId };
    }
}

// --- AI HANDLERS ---
const aiServices = {
    formatResponse: (text) => String(text || '').trim(),

    google: async (apiKey, model, history, temp) => {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const cleanModel = model.replace(/^models\//, '');
            const modelInstance = genAI.getGenerativeModel({ model: cleanModel, generationConfig: { temperature: temp } });
            
            // Separate System Prompt if exists
            const historyForSdk = history.filter(m => m.role !== 'system');
            const systemMsg = history.find(m => m.role === 'system');
            if(systemMsg) modelInstance.systemInstruction = { parts: [{ text: systemMsg.parts[0].text }] };

            const lastMsg = historyForSdk.pop().parts[0].text;
            const chat = modelInstance.startChat({ history: historyForSdk, generationConfig: { temperature: temp } });
            const result = await chat.sendMessage(lastMsg);
            return aiServices.formatResponse(result.response.text());
        } catch (e) { throw new Error(e.message.includes('429') ? "Gemini Rate Limit (429)" : e.message); }
    },

    openaiCompatible: async (config, model, history, temp) => {
        const messages = history.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.parts[0].text }));
        try {
            const res = await fetch(config.baseURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
                body: JSON.stringify({ model, messages, temperature: temp, max_tokens: 2048, stream: false })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || `API Error ${res.status}`);
            return aiServices.formatResponse(data.choices[0].message.content);
        } catch (e) { throw new Error(e.message.includes('429') ? "Provider Rate Limit (429)" : e.message); }
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

// --- DATABASE HELPERS ---
const db = {
    getChat: async (id) => {
        const res = await pool.query('SELECT * FROM ai_history_chatapi WHERE id = $1', [id]);
        return res.rows[0];
    },
    saveChat: async (id, treeData, username, temp) => {
        const json = JSON.stringify(treeData);
        if (id) {
            await pool.query('UPDATE ai_history_chatapi SET conversation_history = $1, created_at = CURRENT_TIMESTAMP, temperature = $3 WHERE id = $2', [json, id, temp]);
            return id;
        } else {
            const res = await pool.query('INSERT INTO ai_history_chatapi (conversation_history, username, temperature) VALUES ($1, $2, $3) RETURNING id', [json, username, temp]);
            return res.rows[0].id;
        }
    },
    getLimits: async (username) => ({ dailyLimit: 100, messageCount: 0 }) // Placeholder for your limit logic
};

// --- ROUTES ---

// Render Page
router.get(["/chatbot/:chatId?", "/chat/:chatId?"], validateSessionAndRole("Any"), async (req, res) => {
    const limits = await db.getLimits(req.session.user.username);
    res.render('mainPages/chatbot.handlebars', { 
        layout: false, 
        chatId: req.params.chatId || null, 
        username: req.session.user.username, 
        role: req.session.user.role,
        limits 
    });
});

// Load Chat (Returns Full Tree)
router.get('/api/chat/histories/:chatId', validateSessionAndRole("Any"), async (req, res) => {
    const chat = await db.getChat(req.params.chatId);
    if (!chat) return res.status(404).json({ message: "Not found" });
    
    // Parse and ensure it's a tree structure
    let history = typeof chat.conversation_history === 'string' ? JSON.parse(chat.conversation_history) : chat.conversation_history;
    const tree = new ChatTree(history); 
    
    res.json({ ...chat, treeData: tree.toJSON() });
});

// Main Chat/Edit Route
router.post('/api/bot-chat', checkMessageLimit, async (req, res) => {
    const { message, chatId, parentMessageId, model: modelStr, temperature: tempParam } = req.body;
    const { username } = req.session.user;

    if (!message?.trim()) return res.status(400).json({ message: "Empty message" });

    try {
        const temp = parseFloat(tempParam) || 0.7;
        let [provider, ...modelParts] = (modelStr || 'gemini/gemini-1.5-flash').split('/');
        let modelName = modelParts.join('/') || provider; // Handle "provider/model" or just "model"
        if(modelParts.length === 0) provider = 'gemini';

        console.log(`[Bot] User: ${username} | Action: ${parentMessageId ? 'Edit/Branch' : 'New/Reply'} | Model: ${modelName}`);

        // 1. Load or Initialize Tree
        let tree;
        let dbId = chatId;
        if (dbId) {
            const chat = await db.getChat(dbId);
            const rawData = typeof chat.conversation_history === 'string' ? JSON.parse(chat.conversation_history) : chat.conversation_history;
            tree = new ChatTree(rawData);
        } else {
            tree = new ChatTree(null);
            // Add System Prompt Root
            tree.addMessage('system', "You are a helpful AI assistant. Be concise.", null);
        }

        // 2. Add User Message (New Node)
        // If parentMessageId is sent, we are branching off that node.
        // If not, we are branching off the current leaf.
        const parentId = parentMessageId || tree.currentLeafId;
        const userNodeId = tree.addMessage('user', message, parentId);

        // 3. Construct Linear History for AI Context
        const historyForAI = tree.getThread(userNodeId);

        // 4. Generate AI Response
        const config = AI_PROVIDERS[provider.toLowerCase()];
        if (!config) throw new Error("Invalid Provider");

        let responseText;
        if (config.type === 'google') responseText = await aiServices.google(config.apiKey, modelName, historyForAI, temp);
        else if (config.type === 'mallow') responseText = await aiServices.mallow(config, message);
        else responseText = await aiServices.openaiCompatible(config, modelName, historyForAI, temp);

        // 5. Add AI Message (Child of User Node)
        const aiNodeId = tree.addMessage('model', responseText, userNodeId);

        // 6. Save Tree
        const newChatId = await db.saveChat(dbId, tree.toJSON(), username, temp);

        res.json({ 
            aiResponse: responseText, 
            newChatId, 
            treeData: tree.toJSON() // Send back updated tree so frontend can re-render
        });

    } catch (error) {
        console.error("Chat Error:", error);
        res.status(error.message.includes('429') ? 429 : 500).json({ message: error.message });
    }
});

router.post('/api/chat/clear-history/:chatId', validateSessionAndRole("Any"), async (req, res) => {
    await pool.query('DELETE FROM ai_history_chatapi WHERE id = $1', [req.params.chatId]);
    res.json({ success: true });
});

router.get('/api/chat/histories', validateSessionAndRole("Any"), async (req, res) => {
    // Basic list fetch (unchanged logic, just ensuring it works)
    const { rows } = await pool.query('SELECT id, created_at FROM ai_history_chatapi WHERE username = $1 ORDER BY created_at DESC', [req.session.user.username]);
    
    // Grouping Logic (Simplified)
    const grouped = { today: [], older: [] };
    const now = new Date();
    rows.forEach(r => {
        const d = new Date(r.created_at);
        const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
        const obj = { id: r.id, created_at: d.toLocaleDateString() };
        if(isToday) grouped.today.push(obj);
        else grouped.older.push(obj);
    });
    res.json(grouped);
});

export default router;