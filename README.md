# ResearchMind

ResearchMind is a research-paper workspace for uploading PDFs, generating structured summaries, and asking questions grounded in a selected paper.

## Architecture

\```text
React frontend → Express backend → MySQL
                       │
                       ├── Stored PDFs
                       └── FastAPI AI service
                              ├── Chroma vector index
                              ├── BM25 keyword index
                              └── LangGraph RAG workflow
\```

The backend manages users, authentication, documents, and chat history. The AI service processes PDFs and answers questions. The frontend communicates with the backend only.

## Features

- User registration and JWT login
- Authenticated PDF upload, listing, and deletion
- Background PDF indexing and structured-summary generation
- Hybrid retrieval using Chroma and BM25
- LLM context compression and evidence-based answers
- Saved chat sessions and source-page references
- One selected, ready PDF per chat question

## Requirements

- Node.js `20.19+` or `22.12+`
- Python `3.10+`
- MySQL
- An OpenAI API key

## Setup

### 1. Configure the database

Create a MySQL database named `agentic_rag_research`, or choose another name and set `DB_NAME` to match.

In MySQL Workbench, select that database as the default schema and run `backend/database/schema.sql`.

For an existing database created with an older schema, apply these migrations only if their columns are missing:

- `backend/database/migrate_chat_message_sources.sql`
- `backend/database/migrate_document_processing_error.sql`

A fresh database created from `schema.sql` already includes both columns.

### 2. Configure environment files

From the repository root in PowerShell:

\```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item ai-service/.env.example ai-service/.env
Copy-Item frontend/.env.example frontend/.env
\```

Edit the new `.env` files with your local database settings, a strong `JWT_SECRET`, and your OpenAI API key. Keep these files private; they are ignored by Git.

The default local addresses are:

| Service | Address |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend | `http://localhost:5000` |
| AI service | `http://127.0.0.1:8000` |

### 3. Start the AI service

\```powershell
cd ai-service
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
\```

Check `http://127.0.0.1:8000/health`.

### 4. Start the backend

Open another terminal from the repository root:

\```powershell
cd backend
npm ci
npm run dev
\```

Check `http://localhost:5000/health`. This endpoint reports whether the backend can connect to MySQL.

### 5. Start the frontend

Open a third terminal from the repository root:

\```powershell
cd frontend
npm ci
npm run dev
\```

Open `http://localhost:5173`.

## How document processing works

After an authenticated upload, the backend stores the PDF and creates its database record. It starts indexing and summary generation as separate background jobs, so the upload response does not wait for them to finish.

The AI service extracts numbered pages, creates semantic chunks, and indexes them in persistent Chroma storage and an in-memory BM25 index. It separately generates a structured summary. The backend records each job’s status and resumes unfinished jobs after a restart. BM25 can rebuild its in-memory index from Chroma.

Only documents with a `ready` indexing status can be selected for chat.

## How chat works

For each question, the backend verifies that the selected document belongs to the authenticated user. The AI service searches that document with Chroma and BM25, combines the results, and reads relevant PDF pages. Its LangGraph workflow checks relevance, compresses context, generates an answer, and checks whether the answer is grounded in the evidence.

The backend saves the question, answer, and source pages in the chat session. If the selected paper does not provide enough evidence, the system returns an insufficient-evidence response.

## Public backend API

All document and chat endpoints require `Authorization: Bearer <JWT>`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Log in |
| `GET` | `/api/auth/me` | Get the authenticated user |
| `POST` | `/api/documents/upload` | Upload one PDF in the `file` form field |
| `GET` | `/api/documents` | List your documents and processing statuses |
| `DELETE` | `/api/documents/:id` | Delete one of your documents |
| `GET` | `/api/documents/summaries` | List recent saved summaries |
| `DELETE` | `/api/documents/summaries/:summaryId` | Delete a saved summary |
| `POST` | `/api/chat` | Ask a question about one selected paper |
| `GET` | `/api/chat/sessions` | List your chat sessions |
| `GET` | `/api/chat/sessions/:sessionId` | Read a chat session |
| `DELETE` | `/api/chat/sessions/:sessionId` | Delete a chat session |

Example chat request:

\```json
{
  "question": "What is the main idea of this paper?",
  "session_id": null,
  "document_ids": [1]
}
\```

Replace `1` with the ID of a ready document returned by `GET /api/documents`. `document_ids` must contain exactly one ID.

PDF uploads are limited to 25 MB. The backend rejects duplicate filenames and duplicate PDF content for the same user.

## Internal AI endpoints

The backend calls these FastAPI endpoints. They are not frontend APIs:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/internal/documents/process` | Index a PDF |
| `POST` | `/internal/documents/summary` | Generate a structured summary |
| `DELETE` | `/internal/documents/{document_id}` | Remove a document’s indexed chunks |
| `POST` | `/internal/chat` | Answer a paper question |

Keep the AI service bound to a local or otherwise restricted interface when deploying. Authentication and user ownership checks are handled by the backend.
