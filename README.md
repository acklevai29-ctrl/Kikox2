# KIKO — Personal AI Chatbot

A dark-purple neon chat UI with a Node/Express backend and provider switching for OpenAI, Anthropic, Google Gemini, and Ollama.

## Requirements

- Node.js 18.18+ (Node 20+ recommended)
- An API key for at least one cloud provider, or a running Ollama installation for local inference

## Run locally

1. Extract the project.
2. Open a terminal in the project folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Create your environment file:

   **Windows PowerShell**
   ```powershell
   Copy-Item .env.example .env
   ```

   **macOS/Linux**
   ```bash
   cp .env.example .env
   ```

5. Open `.env` and add the API key for the provider you want to use. Leave other providers blank if you do not use them.
6. Start the app:

   ```bash
   npm run dev
   ```

7. Open http://localhost:5173

The API server runs on http://localhost:3001. The Vite development server proxies `/api` requests to it.

## Provider setup

- **OpenAI:** set `OPENAI_API_KEY`; optionally change `OPENAI_MODEL`.
- **Anthropic:** set `ANTHROPIC_API_KEY`; optionally change `ANTHROPIC_MODEL`.
- **Google Gemini:** set `GEMINI_API_KEY`; optionally change `GEMINI_MODEL`.
- **Ollama:** install/start Ollama, pull a model (for example `ollama pull llama3.2`), then set `OLLAMA_MODEL` and optionally `OLLAMA_BASE_URL`.

The provider selector appears in the top-right corner. Providers without cloud keys are marked as needing setup. Ollama is listed as available; the server reports a connection error if the local Ollama service is not running.

## Production build

```bash
npm run build
npm start
```

The current Express server exposes the API. To serve the built frontend in production, configure a static host (or add Express static hosting) and set `CLIENT_ORIGIN` to your deployed frontend origin. Use HTTPS and a production secret manager for API keys.

## Security and current scope

- API keys are read from server-side environment variables and are never sent to the browser.
- Chat history and the custom personality prompt are stored in this browser's localStorage. They are not synced or encrypted.
- This starter has no login, server-side user accounts, database, file upload, or multi-user isolation yet. Do not expose it publicly with private conversations until authentication, rate limiting, and per-user storage are added.
- The model providers apply their own usage policies and limits. KIKO lets you customize the assistant's personality and choose providers; it does not remove provider-side restrictions.
- Do not commit `.env` or share API keys.


## Deploy free on Render (single service)

This repository includes `render.yaml` so the Vite website and Express API run together.

1. Push the project to a GitHub repository.
2. On your phone, open https://render.com and sign in with GitHub.
3. Choose **New** → **Blueprint** and select the KIKO repository.
4. Review the `kiko-ai` web service and deploy it on the Free plan.
5. In the service's Environment settings, add `OPENAI_API_KEY` (or keys for another provider) and set `DEFAULT_PROVIDER` to the provider you configured.
6. Wait for the deploy to finish, then open the `onrender.com` URL on your iPhone.

Render's free web service can sleep after inactivity; the first visit after sleep may take a little while to wake. Free plans and quotas can change. Never put API keys in frontend source code or a public GitHub repository.
