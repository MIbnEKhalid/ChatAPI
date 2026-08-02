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

  // Streaming version — yields content deltas via async generator
  openaiCompatibleStream: async function* (config, model, history, temp) {
    if (!config.apiKey) throw new Error("DeepSeek API token is missing.");

    const messages = history.map((m) => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: m.parts[0].text,
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
};

export default aiServices;
