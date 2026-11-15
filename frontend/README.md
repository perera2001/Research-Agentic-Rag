# ResearchMind frontend

Vite + React client for the ResearchMind backend.

## Run locally

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The client calls `http://localhost:5000` by default. To use another backend address, create a local `.env` from `.env.example` and set `VITE_API_BASE_URL`. The backend must be running, and its MySQL migrations must be applied.

## Available screens

- Sign in and registration through `/api/auth`.
- PDF upload, processing status, deletion, and recent summaries through `/api/documents`.
- Research chat and saved sessions through `/api/chat`.

The frontend calls the Node backend only. The backend calls the internal AI service.
