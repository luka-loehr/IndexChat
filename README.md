# IndexChat Workbench (Cloud Edition)

A professional, cloud-first AI workbench for multi-modal document analysis. It uses a "Sources Brain" approach to ingest documents, images, audio, and video, making them searchable and queryable via a modern RAG (Retrieval-Augmented Generation) pipeline.

## 🏗️ Architecture

This project uses a **Local-First / Cloud-Powered** architecture. The heavy ML lifting is done by APIs, while the orchestration and database remain local for privacy and speed.

### 1. **Frontend (Next.js 14)**
*   **Workbench UI**: A 3-column professional layout (Sources Sidebar, Chat Workspace, Tools).
*   **Visuals**: Dark mode, muted professional color palette, Lucide icons.
*   **Interaction**: Drag-and-drop uploads, real-time chat with source citations.

### 2. **Backend (Node.js/Express)**
*   **API Server**: Handles file uploads and search queries (`/ask`, `/upload`).
*   **RAG Engine**: Performs "fan-out" vector searches across three distinct vector spaces (Text, Image, Audio) simultaneously to answer user queries.
*   **Metadata Awareness**: Returns precise timestamps for video/audio matches.

### 3. **Indexer (Python)**
*   **Watcher**: Monitors the `input/` directory for new files.
*   **Multi-Modal Processing**:
    *   **📄 Documents (PDF, DOCX, PPTX)**: Text extraction -> Chunking -> **OpenAI `text-embedding-3-large`**.
    *   **🖼️ Images**: **Hugging Face `openai/clip-vit-base-patch32`** (CLIP) embeddings.
    *   **🎵 Audio**: 
        *   **Speech**: Transcription via **OpenAI Whisper** -> Text Embedding.
        *   **Acoustics**: Sound event detection via **Hugging Face `laion/clap-htsat-unfused`** (CLAP).
    *   **🎥 Video**:
        *   **Visuals**: Extracts frames every 10 seconds -> CLIP Embeddings (allows searching for visual content like "red car").
        *   **Speech**: Extracted audio -> Whisper Transcription (allows searching for spoken words).
        *   **Acoustics**: Extracted audio -> CLAP Embeddings (allows searching for sounds like "applause" or "siren").
*   **Database**: **SQLite** with `sqlite-vss` extension for high-performance local vector search.

## 🚀 Setup & Usage

### Prerequisites
*   Node.js 18+
*   Python 3.10+
*   **API Keys**:
    *   **OpenAI API Key** (for Chat, Transcription, Text Embeddings)
    *   **Hugging Face API Key** (for Image/Audio/Video embeddings)

### Installation

1.  **Install Dependencies** (installs both Node and Python requirements):
    ```bash
    npm install
    ```

2.  **Configure Environment**:
    Create a `.env` file in the root directory:
    ```env
    OPENAI_API_KEY=sk-proj-...
    HUGGINGFACE_API_KEY=hf_...
    ```

3.  **Start the Workbench**:
    ```bash
    npm run dev
    ```
    *   **Frontend**: http://localhost:3000
    *   **Backend**: http://localhost:3001

### Supported File Types

| Type | Formats | How it's Indexed |
| :--- | :--- | :--- |
| **Documents** | PDF, DOCX, PPTX, TXT, MD | Text Search |
| **Images** | JPG, PNG, WEBP | Visual Description Search (CLIP) |
| **Audio** | MP3, WAV, M4A | Speech (Whisper) + Sound Events (CLAP) |
| **Video** | MP4, MOV, AVI | **Visual Frames** (every 10s) + **Speech** (Whisper) + **Sound Events** (CLAP) |

## 💡 Usage Examples

*   **"What was discussed in the marketing meeting?"** (Searches video transcripts and PDFs)
*   **"Find the part where they showed the red car."** (Searches video visual frames for "red car")
*   **"Find audio of applause."** (Searches audio acoustic embeddings)
*   **"Summarize the Q3 report."** (Searches PDF text)

## 🛠️ Troubleshooting

*   **"MoviePy not installed"**: If video audio extraction fails, ensure `moviepy` is installed in the python environment (`pip install moviepy`).
*   **API Rate Limits**: Indexing long videos generates many API calls (1 frame/10s). Ensure your API tiers support this load.
