import fetch from "node-fetch";

// AI service layer — talks to the configured model providers.
const aiServices = {
  formatResponse: (text) => String(text || "").trim(),

  openaiCompatible: async (config, model, history, temp) => {
    if (!config.apiKey) throw new Error("DeepSeek API token is missing.");

    const messages = history.map((m) => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: m.parts[0].text,
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30-second timeout

    try {
      const authHeaders =
        config.authType === "x-api-key"
          ? { "X-API-Key": config.apiKey }
          : { Authorization: `Bearer ${config.apiKey}` };

      const res = await fetch(config.baseURL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          model,
          messages,
          temperature: temp,
          max_tokens: 2048,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `API Error ${res.status}`);
      return aiServices.formatResponse(data.choices[0].message.content);
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === "AbortError") {
        throw new Error("AI request timed out after 30 seconds");
      }
      throw new Error(
        e.message.includes("429") ? "DeepSeek Rate Limit (429)" : e.message
      );
    }
  },
};

export default aiServices;
