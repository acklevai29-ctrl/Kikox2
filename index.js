import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "../dist");
const PORT = Number(process.env.PORT || 3001);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

const providers = {
  openai: {
    label: "OpenAI",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    configured: Boolean(process.env.OPENAI_API_KEY)
  },
  anthropic: {
    label: "Anthropic",
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
    configured: Boolean(process.env.ANTHROPIC_API_KEY)
  },
  gemini: {
    label: "Google Gemini",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    configured: Boolean(process.env.GEMINI_API_KEY)
  },
  ollama: {
    label: "Ollama (local)",
    model: process.env.OLLAMA_MODEL || "llama3.2",
    configured: true
  }
};

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "KIKO API" }));

app.get("/api/providers", (_req, res) => {
  res.json({
    defaultProvider: process.env.DEFAULT_PROVIDER || "openai",
    providers: Object.entries(providers).map(([id, p]) => ({
      id, label: p.label, model: p.model, configured: p.configured
    }))
  });
});

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 80) {
    throw new Error("Send between 1 and 80 messages.");
  }
  return messages.map((m) => {
    if (!["user", "assistant"].includes(m.role) || typeof m.content !== "string") {
      throw new Error("Invalid message format.");
    }
    return { role: m.role, content: m.content.slice(0, 20000) };
  });
}

async function streamOpenAI({ provider, messages, system, res }) {
  const isOllama = provider === "ollama";
  const url = isOllama
    ? `${(process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "")}/api/chat`
    : "https://api.openai.com/v1/chat/completions";
  const model = providers[provider].model;
  const headers = { "Content-Type": "application/json" };
  if (!isOllama) headers.Authorization = `Bearer ${process.env.OPENAI_API_KEY}`;

  const body = isOllama
    ? { model, stream: true, messages: [{ role: "system", content: system }, ...messages] }
    : { model, stream: true, messages: [{ role: "system", content: system }, ...messages] };

  const upstream = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!upstream.ok) throw new Error(`${providers[provider].label} error (${upstream.status}): ${(await upstream.text()).slice(0, 500)}`);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const data = JSON.parse(raw);
          const token = isOllama ? data.message?.content : data.choices?.[0]?.delta?.content;
          if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
        } catch { /* Ignore non-JSON keepalive chunks. */ }
      }
    }
    res.write("data: [DONE]\n\n");
  } finally {
    reader.releaseLock();
    res.end();
  }
}

async function streamAnthropic({ messages, system, res }) {
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: providers.anthropic.model,
      max_tokens: 2048,
      stream: true,
      system,
      messages
    })
  });
  if (!upstream.ok) throw new Error(`Anthropic error (${upstream.status}): ${(await upstream.text()).slice(0, 500)}`);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          const event = JSON.parse(line.slice(5).trim());
          if (event.type === "content_block_delta" && event.delta?.text) {
            res.write(`data: ${JSON.stringify({ token: event.delta.text })}\n\n`);
          }
        } catch { /* Ignore malformed event lines. */ }
      }
    }
    res.write("data: [DONE]\n\n");
  } finally {
    reader.releaseLock();
    res.end();
  }
}

async function streamGemini({ messages, system, res }) {
  const model = providers.gemini.model;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: 2048 }
    })
  });
  if (!upstream.ok) throw new Error(`Gemini error (${upstream.status}): ${(await upstream.text()).slice(0, 500)}`);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          const event = JSON.parse(line.slice(5).trim());
          const token = event.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
          if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
        } catch { /* Ignore malformed event lines. */ }
      }
    }
    res.write("data: [DONE]\n\n");
  } finally {
    reader.releaseLock();
    res.end();
  }
}

app.post("/api/chat", async (req, res) => {
  try {
    const provider = req.body?.provider;
    if (!Object.hasOwn(providers, provider)) return res.status(400).json({ error: "Unknown provider." });
    if (!providers[provider].configured) return res.status(400).json({ error: `${providers[provider].label} is not configured. Add its API key to .env.` });
    const messages = normalizeMessages(req.body?.messages);
    const custom = typeof req.body?.systemPrompt === "string" ? req.body.systemPrompt.slice(0, 4000) : "";
    const system = `You are KIKO, a helpful, conversational personal AI assistant. Be clear, warm, and useful. Follow the user's requested tone where appropriate. ${custom}`.trim();

    const args = { provider, messages, system, res };
    if (provider === "anthropic") await streamAnthropic(args);
    else if (provider === "gemini") await streamGemini(args);
    else await streamOpenAI(args);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error.message || "Unexpected server error." });
    else res.end();
  }
});

// Serve the production Vite build from the same Render service.
app.use(express.static(distPath));
app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));

app.listen(PORT, "0.0.0.0", () => console.log(`KIKO listening on port ${PORT}`));
