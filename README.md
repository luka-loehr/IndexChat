# IndexChat

A local RAG (Retrieval-Augmented Generation) system for querying PDF documents using GPT-4 with tool calling.

## Architecture

- **Python Indexer**: Extracts text from PDFs, chunks it, embeds with `text-embedding-3-large`, stores in SQLite-VSS
- **PDF Watcher**: Monitors the input folder and auto-rebuilds the index when PDFs change
- **Node.js Backend**: Express server with GPT-4o tool calling for RAG queries
- **Next.js Frontend**: Clean UI for asking questions and viewing answers with sources

## Project Structure

```
IndexChat/
├── input/                  # Drop PDFs here
├── indexer/
│   ├── indexer.py          # PDF indexer
│   ├── watcher.py          # File watcher for auto-reindexing
│   ├── requirements.txt
│   └── database.sqlite     # Generated vector database
├── server/
│   ├── server.js           # Express API server
│   ├── ragTools.js         # Vector search implementation
│   ├── openaiClient.js     # OpenAI client config
│   ├── package.json
│   └── .env                # Your API key (create from .env.example)
└── ui/
    ├── app/
    │   ├── page.js
    │   ├── layout.js
    │   └── globals.css
    ├── Components/
    │   └── ChatBox.jsx
    ├── package.json
    └── next.config.js
```

## Setup

### 1. Configure API Key

```bash
cp server/.env.example server/.env
# Edit server/.env and add your OpenAI API key
```

### 2. Install Dependencies

```bash
# This automatically sets up everything:
# - Python virtual environment
# - Python dependencies
# - Node.js dependencies in all directories
npm install
```

### 3. Add PDFs & Build Index

```bash
# Drop PDF files into input/ directory, then:
npm run index
```

### 4. Start Everything

```bash
npm run dev
```

This starts the watcher, backend, and frontend concurrently.

## Usage

1. Open http://localhost:3000 in your browser
2. Type a question about your documents
3. The system will search the indexed PDFs and return an answer with sources

## API

### POST /ask

Request:
```json
{
  "query": "What is the main topic of the documents?"
}
```

Response:
```json
{
  "answer": "Based on the documents...",
  "sources": [
    { "id": 1, "file_name": "document.pdf" }
  ]
}
```

## Notes

- The indexer uses ~800-token chunks with 100-token overlap
- SQLite-VSS extension is optional; falls back to brute-force cosine similarity if not available
- The watcher has a 2-second debounce to batch rapid file changes
