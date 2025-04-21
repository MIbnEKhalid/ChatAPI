import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch';
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";

dotenv.config();
const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.get(["/login", "/signin"], (req, res) => {
    if (req.session?.user) {
        return res.render("staticPage/login.handlebars", {
            userLoggedIn: true,
            UserName: req.session.user.username
        });
    }
    return res.render("staticPage/login.handlebars", { userLoggedIn: false });
});

router.get("/chatbot/:chatId?", validateSessionAndRole("Any"), async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const username = req.session.user.username;
        const userSettings = await fetchUserSettings(username);
        res.render('mainPages/chatbot.handlebars', {
            chatId: chatId || null,
            settings: {
                theme: userSettings.theme || 'dark',
                font_size: userSettings.font_size || 16,
                ai_model: userSettings.ai_model || 'gemini/gemini-1.5-flash',
                temperature: userSettings.temperature || 1.0,
                temperature_value: (userSettings.temperature || 1.0).toFixed(1),
                messageCount: userSettings.messageCount || 0,
                dailyLimit: userSettings.dailyLimit || 100
            },
            UserName: username,
            role: req.session.user.role,
            userLoggedIn: true
        });
    } catch (err) {
        console.error("Error rendering chatbot page:", err);
        res.status(500).render("templates/Error/500", { error: err.message });
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
                formattedTime = `${diffInSeconds} second${diffInSeconds > 1 ? 's' : ''} ago`;
            } else if (diffInSeconds < 3600) {
                const minutes = Math.floor(diffInSeconds / 60);
                formattedTime = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
            } else if (diffInSeconds < 86400) {
                const hours = Math.floor(diffInSeconds / 3600);
                formattedTime = `${hours} hour${hours > 1 ? 's' : ''} ago`;
            } else if (diffInSeconds < 2592000) {
                const days = Math.floor(diffInSeconds / 86400);
                formattedTime = `${days} day${days > 1 ? 's' : ''} ago`;
            } else {
                formattedTime = createdAt.toLocaleDateString();
            }
            return {
                id: row.id,
                created_at: formattedTime,
                temperature: row.temperature || 0.5
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

router.get('/api/chat/histories', validateSessionAndRole("Any"), async (req, res) => {
    try {
        const username = req.session.user.username;
        const chatHistories = await fetchChatHistories(username);
        res.json(chatHistories);
    } catch (error) {
        console.error("Error fetching chat histories:", error);
        res.status(500).json({ message: "Error fetching chat histories.", error: error.message });
    }
});

router.get('/api/chat/histories/:chatId', validateSessionAndRole("Any"), async (req, res) => {
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
            'SELECT ai_model, temperature FROM user_settings WHERE username = $1',
            [username]
        );
        return result.rows.length > 0 ? {
            modelName: result.rows[0].ai_model || 'gemini/gemini-1.5-flash',
            temperature: result.rows[0].temperature || 1.0
        } : {
            modelName: 'gemini/gemini-1.5-flash',
            temperature: 1.0
        };
    } catch (error) {
        console.error("Error retrieving user settings:", error);
        return { modelName: 'gemini/gemini-1.5-flash', temperature: 1.0 };
    }
}

async function gemini(geminiApiKey, modelName, conversationHistory, temperature) {
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${geminiApiKey}`;
    try {
        const response = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: conversationHistory,
                generationConfig: { temperature }
            })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API request failed with status ${response.status}: ${errorData.error?.message || 'Unknown error'}`);
        }
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini API";
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw error;
    }
}

async function mallow(prompt) {
    const mallowApiUrl = "https://literate-slightly-seahorse.ngrok-free.app/generate";
    try {
        const response = await fetch(mallowApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Mallow API request failed with status ${response.status}: ${errorData.error?.message || 'Unknown error'}`);
        }
        const data = await response.json();
        return data.response || "No response from Mallow API";
    } catch (error) {
        return "API service is not available. Please contact [Maaz Waheed](https://github.com/42Wor) to start the API service.";
    }
}

async function NVIDIA(apiKey, modelName, conversationHistory, temperature) {
    const nvidiaApiUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
    const nvidiaFormattedHistory = conversationHistory
        .map(message => ({
            role: message.role === 'model' ? 'assistant' : message.role,
            content: message.parts?.[0]?.text || ''
        }))
        .filter(msg => msg.content);
    try {
        const response = await fetch(nvidiaApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: nvidiaFormattedHistory,
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
            throw new Error(`NVIDIA API request failed (${response.status}): ${errorData.detail || errorData.error?.message || 'Unknown NVIDIA error'}`);
        }
        const data = JSON.parse(responseBody);
        return data.choices?.[0]?.message?.content || "No response from NVIDIA API";
    } catch (error) {
        console.error("Error calling NVIDIA API:", error);
        throw error;
    }
}

router.post('/api/bot-chat', checkMessageLimit, async (req, res) => {
    const { message, chatId } = req.body;
    const username = req.session.user.username;
    let userSettings;
    try {
        userSettings = await getUserSettings(username);
        if (!userSettings.modelName) {
            return res.status(500).json({ message: "Could not retrieve user settings or model configuration." });
        }
    } catch (error) {
        console.error("Error fetching user settings:", error);
        return res.status(500).json({ message: "Failed to fetch user settings.", error: error.message });
    }
    const temperature = Math.min(Math.max(parseFloat(userSettings.temperature || 1.0), 0), 2);
    let conversationHistory = [];
    try {
        if (chatId) {
            const fetchedHistory = await fetchChatHistoryById(chatId);
            if (fetchedHistory && fetchedHistory.conversation_history) {
                conversationHistory = typeof fetchedHistory.conversation_history === 'string'
                    ? JSON.parse(fetchedHistory.conversation_history)
                    : fetchedHistory.conversation_history;
            } else if (chatId) {
                return res.status(404).json({ message: "Chat history not found for the given chatId." });
            }
        }
    } catch (error) {
        console.error("Error fetching chat history:", error);
        return res.status(500).json({ message: "Failed to fetch chat history.", error: error.message });
    }
    conversationHistory.push({ role: "user", parts: [{ text: message }] });
    let aiResponseText;
    const fullModelName = userSettings.modelName;
    let provider = '';
    let modelIdentifier = '';
    if (fullModelName.includes('/')) {
        const parts = fullModelName.split('/');
        provider = parts[0].toLowerCase();
        modelIdentifier = parts.slice(1).join('/');
    } else {
        console.warn(`Model name "${fullModelName}" does not contain a provider prefix. Defaulting to Gemini.`);
        provider = 'gemini';
        modelIdentifier = fullModelName;
    }
    console.log(fullModelName)
    try {
        switch (provider) {
            case 'mallow':
                aiResponseText = await mallow(message);
                break;
            case 'nvidia':
                const nvidiaApiKey = process.env.NVIDIA_API;
                if (!nvidiaApiKey) {
                    throw new Error("NVIDIA API key (NVIDIA_API_KEY) not configured.");
                }
                aiResponseText = await NVIDIA(nvidiaApiKey, fullModelName, conversationHistory, temperature);
                console.log("nvidia")
                break;
            case 'gemini':
            default:
                const geminiApiKey = process.env.GEMINI_API_KEY_maaz_waheed;
                if (!geminiApiKey) {
                    throw new Error("Gemini API key not configured.");
                }
                aiResponseText = await gemini(geminiApiKey, modelIdentifier, conversationHistory, temperature);
                console.log("gemini")
                break;
        }
    } catch (error) {
        console.error(`Error calling AI API for provider ${provider}:`, error);
        return res.status(500).json({ message: `Error processing ${provider} API request.`, error: error.message });
    }
    if (aiResponseText) {
        let newChatId = chatId;
        if (provider !== 'mallow') {
            conversationHistory.push({ role: "model", parts: [{ text: aiResponseText }] });
            try {
                const historyJson = JSON.stringify(conversationHistory);
                if (chatId) {
                    await pool.query(
                        'UPDATE Ai_history SET conversation_history = $1, created_at = CURRENT_TIMESTAMP, temperature = $3 WHERE id = $2',
                        [historyJson, chatId, temperature]
                    );
                } else {
                    const insertResult = await pool.query(
                        'INSERT INTO Ai_history (conversation_history, username, temperature) VALUES ($1, $2, $3) RETURNING id',
                        [historyJson, username, temperature]
                    );
                    newChatId = insertResult.rows[0].id;
                }
            } catch (error) {
                console.error("Error saving chat history:", error);
                return res.status(500).json({
                    message: "AI response generated, but failed to save chat history.",
                    error: error.message,
                    aiResponse: aiResponseText
                });
            }
        }
        res.json({ aiResponse: aiResponseText, newChatId });
    } else {
        res.status(500).json({ message: `AI API (${provider}) returned an empty response.` });
    }
});

router.post('/api/chat/clear-history/:chatId', validateSessionAndRole("Any"), async (req, res) => {
    const chatId = req.params.chatId;
    if (!chatId) {
        return res.status(400).json({ message: "Chat ID is required." });
    }
    try {
        await pool.query('DELETE FROM Ai_history WHERE id = $1', [chatId]);
        res.json({ status: 200, message: "Chat history deleted successfully.", chatId });
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
        const today = new Date().toISOString().split("T")[0];
        const messageLog = await pool.query(
            'SELECT message_count FROM user_message_logs WHERE username = $1 AND date = $2',
            [username, today]
        );
        const messageCount = messageLog.rows[0]?.message_count || 0;
        return settingsResult.rows.length > 0 ? {
            theme: settingsResult.rows[0].theme || 'dark',
            font_size: settingsResult.rows[0].font_size || 16,
            ai_model: settingsResult.rows[0].ai_model || 'gemini/gemini-1.5-flash',
            temperature: settingsResult.rows[0].temperature || 1.0,
            dailyLimit: settingsResult.rows[0].daily_message_limit || 100,
            messageCount
        } : {
            theme: 'dark',
            font_size: 16,
            ai_model: 'gemini/gemini-1.5-flash',
            temperature: 1.0,
            dailyLimit: 100,
            messageCount
        };
    } catch (error) {
        console.error("Error fetching user settings:", error);
        return {
            theme: 'dark',
            font_size: 16,
            ai_model: 'gemini/gemini-1.5-flash',
            temperature: 1.0,
            dailyLimit: 100,
            messageCount: 0
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

router.get('/api/user-settings', validateSessionAndRole("Any"), async (req, res) => {
    try {
        const username = req.session.user.username;
        const userSettings = await fetchUserSettings(username);
        res.json(userSettings);
    } catch (error) {
        console.error("Error in /api/user-settings:", error);
        res.status(500).json({ message: "Error fetching user settings", error: error.message });
    }
});

router.post('/api/save-settings', validateSessionAndRole("Any"), async (req, res) => {
    try {
        const username = req.session.user.username;
        const settings = req.body;
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

router.post('/api/logout', validateSessionAndRole("Any"), (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Error during logout:", err);
            return res.status(500).json({ message: "Logout failed." });
        }
        res.json({ message: "Logged out successfully." });
    });
});

export default router;