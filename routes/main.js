import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch';
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";
import crypto from 'crypto'; 

dotenv.config();
const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// --- 1. CONFIGURATION ---
const AI_PROVIDER = {
    type: 'openai-compatible',
    baseURL: 'https://api.deepseek.com/chat/completions',
    apiKey: process.env.DEEPSEEK_API_TOKEN,
    authType: 'bearer'
};

const DEEPSEEK_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

const ENCRYPTION_SECRET = process.env.API_KEY_ENCRYPTION_SECRET;
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET || 'mbk-chatapi-default-secret-please-set-env').digest();
const USER_KEY_STORAGE_ENABLED = Boolean(ENCRYPTION_SECRET);

function encryptKey(plainText) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptKey(encryptedText) {
    if (!encryptedText || typeof encryptedText !== 'string') return null;
    const [ivHex, tagHex, encryptedHex] = encryptedText.split(':');
    if (!ivHex || !tagHex || !encryptedHex) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}

if (!USER_KEY_STORAGE_ENABLED) {
    console.warn('API_KEY_ENCRYPTION_SECRET is not set. User-provided AI keys are disabled until the environment variable is configured.');
}

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

    openaiCompatible: async (config, model, history, temp) => {
        if (!config.apiKey) throw new Error('DeepSeek API token is missing.');
        const messages = history.map(m => ({ 
            role: m.role === 'model' ? 'assistant' : m.role, 
            content: m.parts[0].text 
        }));
        
        try {
            const authHeaders = config.authType === 'x-api-key'
                ? { 'X-API-Key': config.apiKey }
                : { 'Authorization': `Bearer ${config.apiKey}` };

            const res = await fetch(config.baseURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
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
                        throw new Error(e.message.includes('429') ? "DeepSeek Rate Limit (429)" : e.message); 
        }
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
    },

    initUserApiKeyStore: async () => {
        if (!USER_KEY_STORAGE_ENABLED) return;
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_api_keys_chatapi (
                username TEXT NOT NULL,
                provider TEXT NOT NULL,
                encrypted_key TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (username, provider)
            )
        `);
    },

    getUserApiKeys: async (username) => {
        if (!USER_KEY_STORAGE_ENABLED) return {};
        await db.initUserApiKeyStore();
        const res = await pool.query('SELECT provider, encrypted_key FROM user_api_keys_chatapi WHERE username = $1', [username]);
        return res.rows.reduce((acc, row) => {
            const decrypted = decryptKey(row.encrypted_key);
            if (decrypted) acc[row.provider] = decrypted;
            return acc;
        }, {});
    },

    saveUserApiKey: async (username, provider, apiKey) => {
        if (!USER_KEY_STORAGE_ENABLED) throw new Error('User API key storage is not enabled. Set API_KEY_ENCRYPTION_SECRET.');
        await db.initUserApiKeyStore();
        if (!apiKey) {
            await pool.query('DELETE FROM user_api_keys_chatapi WHERE username = $1 AND provider = $2', [username, provider]);
            return;
        }
        const encryptedKey = encryptKey(apiKey);
        await pool.query(
            `INSERT INTO user_api_keys_chatapi (username, provider, encrypted_key)
             VALUES ($1, $2, $3)
             ON CONFLICT (username, provider)
             DO UPDATE SET encrypted_key = $3, updated_at = CURRENT_TIMESTAMP`,
            [username, provider, encryptedKey]
        );
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
        let modelName = (modelStr || 'deepseek/deepseek-v4-flash').split('/').pop();
        if (!DEEPSEEK_MODELS.has(modelName)) {
            modelName = 'deepseek-v4-flash';
        }

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
        const userApiKeys = await db.getUserApiKeys(username);
        const userApiKey = userApiKeys.deepseek;
        // Use user-provided API token if available; otherwise fall back to the shared system token.
        const requestConfig = { ...AI_PROVIDER, apiKey: userApiKey || AI_PROVIDER.apiKey };

        if (!requestConfig.apiKey) {
            throw new Error('No DeepSeek API token configured. Add a valid token in your account settings or set DEEPSEEK_API_TOKEN in environment variables.');
        }

        const responseText = await aiServices.openaiCompatible(requestConfig, modelName, historyForAI, temp);

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

router.get('/api/user/api-keys', validateSessionAndRole("Any"), async (req, res) => {
    try {
        const apiKeys = await db.getUserApiKeys(req.session.user.username);
        const response = { deepseek: apiKeys.deepseek ? 'configured' : null };
        res.json({ apiKeys: response });
    } catch (e) {
        res.status(500).json({ message: e.message || 'Unable to load API keys' });
    }
});

router.post('/api/user/api-keys', validateSessionAndRole("Any"), async (req, res) => {
    try {
        const { provider, apiKey } = req.body;
        if (!provider || typeof provider !== 'string') return res.status(400).json({ message: 'Provider is required' });

        const providerKey = provider.toLowerCase();
        if (providerKey !== 'deepseek') {
            return res.status(400).json({ message: 'Unknown provider' });
        }

        await db.saveUserApiKey(req.session.user.username, providerKey, apiKey?.trim());
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message || 'Unable to save API key' });
    }
});

export default router;