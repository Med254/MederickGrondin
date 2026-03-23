# Hello World (TypeScript + Node + SQLite)

Simple “Hello World” website with a form that saves **name** and **family name** into a SQLite database.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Set your OpenAI key (local only)

Option A (recommended): create a `.env` file (not committed)

1. Copy `.env.example` to `.env`
2. Put your key in `.env`:

```bash
OPENAI_API_KEY=sk-...
```

Restart `npm run dev`.

Option B: PowerShell env var (current terminal only)

```bash
$env:OPENAI_API_KEY="sk-..."
npm run dev
```

## API

- `GET /api/people` → list saved people
- `POST /api/people` with JSON `{ "name": "...", "familyName": "..." }`

## Chatbot (OpenAI)

Set `OPENAI_API_KEY` in your environment (don’t hardcode it in code).

- `GET /api/chat` → current messages for this browser session
- `POST /api/chat` with JSON `{ "message": "..." }` → gets a reply
- `POST /api/chat/reset` → clears chat history

