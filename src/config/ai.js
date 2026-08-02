// AI provider configuration for the chat application.

export const AI_PROVIDER = {
  type: "openai-compatible",
  baseURL: "https://api.deepseek.com/chat/completions",
  apiKey: process.env.DEEPSEEK_API_TOKEN,
  authType: "bearer",
};

export const DEEPSEEK_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);
