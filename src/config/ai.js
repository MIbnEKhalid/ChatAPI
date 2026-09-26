// AI provider configuration for the chat application.

export const DEEPSEEK_CONFIG = {
  type: "openai-compatible",
  baseURL: "https://api.deepseek.com/chat/completions",
  apiKey: process.env.DEEPSEEK_API_TOKEN,
  authType: "bearer",
};

export const GEMINI_CONFIG = {
  type: "gemini",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/models",
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
};

// Backwards-compatible export
export const AI_PROVIDER = DEEPSEEK_CONFIG;

export const DEEPSEEK_MODELS = new Set([
  "deepseek-v4-flash",
  "deepseek-v4-pro",
]);

export const GEMINI_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
]);

export function getModelProvider(modelStr) {
  const modelName = (modelStr || "").toLowerCase().split("/").pop();
  if (GEMINI_MODELS.has(modelName) || modelName.startsWith("gemini")) {
    return {
      provider: "gemini",
      modelName: GEMINI_MODELS.has(modelName) ? modelName : "gemini-2.5-flash",
    };
  }
  return {
    provider: "deepseek",
    modelName: DEEPSEEK_MODELS.has(modelName) ? modelName : "deepseek-v4-flash",
  };
}

