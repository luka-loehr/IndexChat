# IndexChat Workbench

A modern, "Workbench" style AI assistant for your documents, powered by local RAG (Retrieval-Augmented Generation).

## Features

-   **3-Column Workbench UI**: specialized areas for Sources, Thinking (Chat), and Tools.
-   **Multi-Modal Support**: Indexes and understands:
    -   PDFs
    -   Word Documents (.docx)
    -   PowerPoint Presentations (.pptx)
    -   Images (via CLIP embeddings)
    -   Audio/Video (via Transcription)
    -   Text/Markdown files
-   **Local & Private**: Runs locally using OpenAI embeddings and GPT-4 for generation (keys required).
-   **Auto-Indexing**: Watcher detects new files in `input/` and updates the index immediately.

## Architecture

-   **Frontend**: Next.js 14 (App Router) with a dark, muted "professional" design.
-   **Backend**: Node.js Express server handling uploads and RAG queries.
-   **Indexer**: Python script using `sqlite-vss` for vector search and `transformers`/`openai` for embeddings.

## Project Structure

```
IndexChat/
├── .env                    # API keys
├── input/                  # Document ingestion folder
├── indexer/
│   ├── indexer.py          # Main indexing logic
│   ├── watcher.py          # File system watcher
│   └── requirements.txt    # Python dependencies
├── server/
│   ├── server.js           # API Server
│   └── ragTools.js         # RAG implementation
└── ui/                     # Next.js Frontend
```

## Setup & Usage

### 1. Prerequisites
-   Node.js 18+
-   Python 3.10+
-   OpenAI API Key (for Embeddings and Chat)

### 2. Installation

```bash
# Install all dependencies (Node.js & Python)
npm install
```

### 3. Configuration

Create a `.env` file in the root directory:

```env
OPENAI_API_KEY=sk-your-key-here
```

### 4. Running the Workbench

Start all services (Frontend, Backend, Watcher) with one command:

```bash
npm run dev
```

-   **Frontend**: http://localhost:3000
-   **Backend**: http://localhost:3001

### 5. Adding Sources
You can add sources in two ways:
1.  **Drag & Drop**: Use the "Add Sources" button in the UI or drag files into the `input/` folder.
2.  **Auto-Sync**: Any file added to the `input/` folder is automatically detected and indexed.

## supported File Types
-   **Documents**: PDF, DOCX, PPTX, TXT, MD
-   **Images**: JPG, PNG, WEBP (Searchable by content description)
-   **Audio/Video**: MP3, MP4, WAV (Transcribed and indexed)

## Troubleshooting
-   **Missing Python Packages**: If the indexer fails, try manually installing dependencies: `pip install -r indexer/requirements.txt`
-   **Database Locks**: If the indexer hangs, remove `indexer/database.sqlite` and restart.
