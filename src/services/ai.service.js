// AI service layer — talks to the configured model providers (DeepSeek & Google Gemini).
const aiServices = {
  formatResponse: (text) => String(text || "").trim(),

  openaiCompatible: async (config, model, history, temp) => {
    if (!config.apiKey) throw new Error("DeepSeek API token is missing.");

    const messages = history.map((m) => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: Array.isArray(m.parts) ? m.parts[0]?.text : m.content || "",
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
      return aiServices.formatResponse(data.choices?.[0]?.message?.content);
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

  // Streaming version — yields content deltas via async generator
  openaiCompatibleStream: async function* (config, model, history, temp) {
    if (!config.apiKey) throw new Error("DeepSeek API token is missing.");

    const messages = history.map((m) => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: Array.isArray(m.parts) ? m.parts[0]?.text : m.content || "",
    }));

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
        stream: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API Error ${res.status}`);
    }

    // Parse SSE stream — node-fetch v3 body is a Node.js Readable
    let buffer = "";

    for await (const chunk of res.body) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === "[DONE]") return;

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // skip malformed JSON lines
        }
      }
    }
  },

  // Google Gemini — generateContent API
  gemini: async (config, model, history, temp) => {
    if (!config.apiKey) throw new Error("Google Gemini API key is missing.");

    const contents = history.map((m) => ({
      role: m.role === "assistant" ? "model" : m.role,
      parts: Array.isArray(m.parts) ? m.parts : [{ text: String(m.content || "") }],
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const url = `${config.baseURL}/${model}:generateContent?key=${config.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: temp,
            maxOutputTokens: 4096,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `Gemini API Error ${res.status}`);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return aiServices.formatResponse(text);
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === "AbortError") {
        throw new Error("Gemini request timed out after 30 seconds");
      }
      throw new Error(
        e.message.includes("429") ? "Gemini Rate Limit (429)" : e.message
      );
    }
  },

  // Google Gemini — streamGenerateContent API (SSE)
  geminiStream: async function* (config, model, history, temp) {
    if (!config.apiKey) throw new Error("Google Gemini API key is missing.");

    const contents = history.map((m) => ({
      role: m.role === "assistant" ? "model" : m.role,
      parts: Array.isArray(m.parts) ? m.parts : [{ text: String(m.content || "") }],
    }));

    const url = `${config.baseURL}/${model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: temp,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API Error ${res.status}`);
    }

    let buffer = "";
    for await (const chunk of res.body) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(5).trim();
        try {
          const parsed = JSON.parse(jsonStr);
          const parts = parsed.candidates?.[0]?.content?.parts;
          if (parts && parts.length > 0) {
            for (const part of parts) {
              if (part.text) yield part.text;
            }
          }
        } catch {
          // skip malformed JSON lines
        }
      }
    }
  },
};

export default aiServices;

