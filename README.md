# IndexChat Workbench (Cloud Edition)

A professional AI workbench for your documents, powered by Cloud APIs (OpenAI + Hugging Face).

## Features

-   **Cloud-First Architecture**: No heavy local models. Uses:
    -   **OpenAI `text-embedding-3-large`** for text.
    -   **OpenAI `gpt-4o`** for reasoning and chat.
    -   **Hugging Face Inference API** for Multimodal Embeddings:
        -   Image: `openai/clip-vit-base-patch32` (CLIP)
        -   Audio: `laion/clap-htsat-unfused` (CLAP)
-   **Multi-Modal Search**:
    -   Search text with text.
    -   Search images with text descriptions.
    -   Search audio with text descriptions (e.g. "sound of rain").
-   **Workbench UI**: Clean, 3-column layout for serious work.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Configure Environment**:
    Create `.env` in the root directory:
    ```env
    OPENAI_API_KEY=sk-proj-...
    HUGGINGFACE_API_KEY=hf_...  # Required for Image/Audio indexing
    ```

3.  **Run**:
    ```bash
    npm run dev
    ```

## Usage

-   **Add Sources**: Drag files into the UI or `input/` folder.
-   **Supported Formats**: PDF, DOCX, PPTX, TXT, JPG, PNG, MP3, WAV, MP4.
-   **Search**: Type "Find documents about X" or "Find images of a cat" or "Find audio of applause".

## Note on Video
Videos are treated as Audio (Transcription + CLAP embedding). Visual frame extraction is currently simplified to filename-based or future expansion.
