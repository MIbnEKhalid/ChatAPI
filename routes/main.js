import express from "express";
import dotenv from "dotenv";
import fetch from 'node-fetch';
import { pool } from "./pool.js";
import { validateSession, validateSessionAndRole } from "mbkauthe";
import { checkMessageLimit } from "./checkMessageLimit.js";
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import keys from './ss.json' assert { type: 'json' };

dotenv.config();
const router = express.Router();

const gapi = JSON.stringify(keys);

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// --- Google API Initialization (Do this ONCE at the top level) ---
let auth, client, projectId, serviceusage, googleAuthError = null;

try {
    console.log("Initializing Google Auth...");
    auth = new GoogleAuth({
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ? JSON.parse(gapi) : undefined,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    console.log("Getting Google Auth Client...");
    client = await auth.getClient();
    console.log("Google Auth Client obtained.");

    console.log("Getting Project ID...");
    projectId = await auth.getProjectId();
    console.log(`Project ID: ${projectId}`);

    console.log("Initializing Google Service Usage API Client...");
    serviceusage = google.serviceusage({
        version: 'v1',
        auth: client // Use the authenticated client obtained above
    });
    console.log("Google Service Usage API Client initialized.");

} catch (err) {
    console.error("FATAL: Failed to initialize Google API clients:", err);
    googleAuthError = err; // Store the error to report later
    // Depending on your app's needs, you might want to prevent the app from starting
    // process.exit(1);
}

// Test GoogleAuth connection
router.get('/test-google-auth', async (req, res) => {
    if (googleAuthError) {
        return res.status(500).json({
            success: false,
            message: "GoogleAuth initialization failed during startup.",
            error: googleAuthError.message,
            details: googleAuthError.stack // Provide more detail if needed
        });
    }
    try {
        // Re-authenticate or get a fresh token to be sure
        const currentClient = await auth.getClient(); // Use the top-level auth
        const token = await currentClient.getAccessToken();
        res.json({
            success: true,
            message: "GoogleAuth connection appears successful.",
            projectId: projectId,
            accessTokenObtained: !!token.token
        });
    } catch (error) {
        console.error("Error testing GoogleAuth connection:", error);
        res.status(500).json({
            success: false,
            message: "Failed to test GoogleAuth connection.",
            error: error.message
        });
    }
});

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




router.get('/admin/chatbot/gemini', validateSessionAndRole("SuperAdmin"), async (req, res) => {
    try {
        // Check if Google API initialization failed during startup
        if (googleAuthError) {
            return res.status(500).render("templates/Error/500", {
                error: "Google API client initialization failed during startup.",
                details: googleAuthError.message
            });
        }
        if (!serviceusage || !projectId) {
            return res.status(500).render("templates/Error/500", {
                error: "Google Service Usage client or Project ID not available. Initialization might have failed.",
            });
        }


        const geminiApiKey = process.env.GEMINI_API_KEY_maaz_waheed; // Make sure this env var is set
        if (!geminiApiKey) {
            return res.status(500).render("templates/Error/500", {
                error: "Gemini API Key (GEMINI_API_KEY_maaz_waheed) is not configured in environment variables."
            });
        }

        // 1. Get Gemini Models Information (Keep this part as is)
        const geminiModels = [
            'gemini-2.0-flash',
            'gemini-2.0-flash-lite',
            'gemini-1.5-flash',
            'gemini-1.5-flash-8b',
            'gemini-1.5-pro'
        ];

        console.log("Fetching Gemini model details...");
        const modelDataPromises = geminiModels.map(async (model) => {
            // ... (your existing model fetching logic - seems okay) ...
            try {
                const modelInfoUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${geminiApiKey}`;
                const infoResponse = await fetch(modelInfoUrl);

                if (!infoResponse.ok) {
                    console.warn(`Failed to fetch info for model ${model}: ${infoResponse.status}`);
                    return {
                        name: model,
                        available: false,
                        error: `Model info not available (${infoResponse.status})`
                    };
                }
                const infoData = await infoResponse.json();

                // Count tokens (optional, can be slow) - Consider removing if not essential for dashboard speed
                const tokenResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens?key=${geminiApiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: "Test query" }] }]
                    })
                });
                const tokenData = tokenResponse.ok ? await tokenResponse.json() : null;

                return {
                    name: model,
                    available: true,
                    description: infoData.description || 'No description',
                    inputTokenLimit: infoData.inputTokenLimit || 'Unknown',
                    outputTokenLimit: infoData.outputTokenLimit || 'Unknown',
                    supportedMethods: infoData.supportedGenerationMethods || [],
                    testTokens: tokenData?.totalTokens || (tokenResponse.ok ? 'N/A' : 'Count failed'),
                    lastTested: new Date().toISOString()
                };
            } catch (err) {
                console.error(`Error processing model ${model}:`, err);
                return { name: model, available: false, error: err.message };
            }
        });
        const modelData = await Promise.all(modelDataPromises);
        console.log("Gemini model details fetched.");


        // 2. Get Quota Information from Google Cloud API
        let quotaInfo = {};
        try {
            console.log(`Fetching quota for project: ${projectId}, service: generativelanguage.googleapis.com`);

            // --- Add diagnostic logging ---
            console.log('Is serviceusage client defined?', !!serviceusage);
            if (serviceusage) {
                 console.log('Is serviceusage.services defined?', !!serviceusage.services);
                 if (serviceusage.services) {
                    // --- Log the available keys/methods on serviceusage.services ---
                    console.log('Keys available on serviceusage.services:', Object.keys(serviceusage.services));
                    // --- End logging keys ---

                    console.log('Is serviceusage.services.consumerQuotaMetrics defined?', !!serviceusage.services.consumerQuotaMetrics);
                     if (serviceusage.services.consumerQuotaMetrics) {
                         console.log('Is serviceusage.services.consumerQuotaMetrics.list a function?', typeof serviceusage.services.consumerQuotaMetrics.list === 'function');
                     }
                 }
            }
            // --- End diagnostic logging ---


            // Use the pre-initialized serviceusage client from the top level
            const quotas = await serviceusage.services.consumerQuotaMetrics.list({ // <-- Error occurs here
                parent: `projects/${projectId}/services/generativelanguage.googleapis.com`
            });
            console.log("Quota data received:", quotas.data); // Log the raw response

            // Process quota metrics
            const processMetric = (metric) => {
                // Adjust parsing based on actual 'quotas.data' structure logged above
                const limitInfo = metric.consumerQuotaLimits?.[0]?.quotaBuckets?.[0];
                const limit = limitInfo?.effectiveLimit;
                const usage = limitInfo?.currentUsage ?? limitInfo?.consumerUsage ?? 0; // Check both potential usage fields or default to 0
                const name = metric.metric || metric.name || 'Unknown Metric'; // Be flexible with name field

                // Calculate percentage carefully, handle potential string 'Unlimited' or large numbers
                let percentage = 'N/A';
                if (limit && limit !== 'Unlimited' && !isNaN(Number(limit)) && Number(limit) > 0 && !isNaN(Number(usage))) {
                    percentage = Math.round((Number(usage) / Number(limit)) * 100) + '%';
                } else if (limit === 'Unlimited') {
                    percentage = '0%'; // Usage against unlimited is effectively 0% of limit
                }

                return {
                    displayName: metric.displayName || name, // Prefer display name
                    name: name,
                    limit: limit || 'N/A', // Use 'N/A' if undefined
                    usage: usage,
                    percentage: percentage
                };
            };

            quotaInfo = {
                metrics: quotas.data?.metrics?.map(processMetric) || [], // Safely access metrics
                updatedAt: new Date().toISOString()
            };
            console.log("Processed quota info:", quotaInfo);

        } catch (quotaError) {
            // ... existing catch block ...
             console.error("Failed to fetch or process quota:", quotaError);
             // Add logging for the object structure if the error is related to finding the method
             if (quotaError instanceof TypeError && quotaError.message.includes('undefined')) {
                console.error("Potential structure issue. serviceusage object:", serviceusage); // Log the whole client
                if (serviceusage?.services) {
                    console.error("serviceusage.services object:", serviceusage.services); // Log the services part
                }
             }
             console.error("Quota Error Details:", quotaError.response?.data || quotaError.message);
             quotaInfo = { /* ... existing error info ... */ };
        }

        // 3. Prepare data for Handlebars
        const formatDate = (isoString) => isoString ? new Date(isoString).toLocaleString() : 'N/A';
        const availableModels = modelData.filter(m => m.available);
        const unavailableModels = modelData.filter(m => !m.available);

        res.render("mainPages/geminiDashboard", {
            title: "Gemini API Dashboard",
            models: availableModels,
            unavailableModels,
            quotaInfo,
            lastUpdated: formatDate(new Date().toISOString()),
            apiKeyConfigured: !!geminiApiKey,
            googleAuthError: googleAuthError ? googleAuthError.message : null, // Pass auth error to template
            projectId: projectId, // Pass project ID for display
            helpers: {
                json: (context) => JSON.stringify(context, null, 2), // Pretty print JSON
                join: (array, separator) => Array.isArray(array) ? array.join(separator) : 'None',
                formatNumber: (num) => (typeof num === 'number' || (typeof num === 'string' && !isNaN(Number(num)))) ? Number(num).toLocaleString() : num?.toString() || '0', // Handle numbers and strings safely
                findMetric: (metrics, name) => Array.isArray(metrics) ? (metrics.find(m => m.name === name) || { name: name, usage: 'Not found', limit: 'N/A', percentage: 'N/A' }) : { name: name, usage: 'Metrics unavailable', limit: 'N/A', percentage: 'N/A' },
                isError: (obj) => obj && obj.error, // Helper to check if quotaInfo has an error
                formatDate: formatDate // Make formatDate available
            }
        });

    } catch (error) {
        console.error("Unexpected error in /admin/chatbot/gemini route:", error);
        res.status(500).render("templates/Error/500", {
            error: "Failed to retrieve Gemini API information due to an unexpected server error.",
            details: error.message
        });
    }
});

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

// router.get('/favicon.ico', (_, res) => res.sendFile(path.join(__dirname, '..', 'public','Assets','Images', 'dg.svg')));
export default router;