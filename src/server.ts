import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import OpenAI from "openai";
import { getDb } from "./db.js";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

app.use(express.static(path.join(projectRoot, "public")));

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const MODEL_NAME = "gpt-5.2";
const MAX_HISTORY = 20;
const RATE_LIMIT_SECONDS = 1;
const SYSTEM_PROMPT =
  "Whatever i say, create a joke with it and be funny as much as possible";

function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function getOrCreateSessionId(req: express.Request, res: express.Response) {
  const cookies = parseCookies(req.header("cookie"));
  const existing = cookies.sid;
  if (existing) return existing;

  const sid = crypto.randomUUID();
  res.setHeader(
    "Set-Cookie",
    `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax`
  );
  return sid;
}

type SessionState = {
  history: ChatMessage[];
  lastCallTimeMs: number;
};

const sessions = new Map<string, SessionState>();

function getSessionState(sid: string): SessionState {
  const existing = sessions.get(sid);
  if (existing) return existing;

  const state: SessionState = {
    history: [{ role: "system", content: SYSTEM_PROMPT }],
    lastCallTimeMs: 0
  };
  sessions.set(sid, state);
  return state;
}

function trimHistory(history: ChatMessage[]) {
  if (history.length <= MAX_HISTORY) return history;
  return [history[0], ...history.slice(-MAX_HISTORY)];
}

async function enforceRateLimit(state: SessionState) {
  const now = Date.now();
  const minDelta = RATE_LIMIT_SECONDS * 1000;
  const delta = now - state.lastCallTimeMs;
  if (delta < minDelta) {
    await new Promise((r) => setTimeout(r, minDelta - delta));
  }
  state.lastCallTimeMs = Date.now();
}

app.get("/api/people", async (_req, res) => {
  const db = await getDb();
  const rows = await db.all<{
    id: number;
    name: string;
    familyName: string;
    createdAt: string;
  }[]>("SELECT id, name, familyName, createdAt FROM people ORDER BY id DESC");
  res.json({ people: rows });
});

app.post("/api/people", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const familyName =
    typeof req.body?.familyName === "string" ? req.body.familyName.trim() : "";

  if (!name || !familyName) {
    res.status(400).json({ error: "Both name and familyName are required." });
    return;
  }

  const db = await getDb();
  const createdAt = new Date().toISOString();
  const result = await db.run(
    "INSERT INTO people (name, familyName, createdAt) VALUES (?, ?, ?)",
    name,
    familyName,
    createdAt
  );

  res.status(201).json({
    id: result.lastID,
    name,
    familyName,
    createdAt
  });
});

app.get("/api/chat", (req, res) => {
  const sid = getOrCreateSessionId(req, res);
  const state = getSessionState(sid);
  res.json({ messages: state.history.slice(1) });
});

app.post("/api/chat/reset", (req, res) => {
  const sid = getOrCreateSessionId(req, res);
  sessions.set(sid, {
    history: [{ role: "system", content: SYSTEM_PROMPT }],
    lastCallTimeMs: 0
  });
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const client = getOpenAIClient();
  if (!client) {
    res.status(500).json({
      error:
        "OPENAI_API_KEY is not set. Set it in your environment, then restart the server."
    });
    return;
  }

  const sid = getOrCreateSessionId(req, res);
  const state = getSessionState(sid);

  const message =
    typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "message is required." });
    return;
  }

  await enforceRateLimit(state);

  state.history.push({ role: "user", content: message });
  state.history = trimHistory(state.history);

  try {
    const response = await client.responses.create({
      model: MODEL_NAME,
      input: state.history,
      temperature: 0.7,
      max_output_tokens: 800
    });

    const reply = response.output_text || "";
    state.history.push({ role: "assistant", content: reply });
    state.history = trimHistory(state.history);

    res.json({ reply, messages: state.history.slice(1) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

