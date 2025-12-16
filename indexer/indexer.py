#!/usr/bin/env python3
"""
IndexChat Multi-Format Indexer
Indexes PDF, DOCX, PPTX, Images, Audio, and Video into SQLite-VSS for vector search.
"""

import argparse
import os
import struct
import sqlite3
from pathlib import Path
import mimetypes

import tiktoken
from openai import OpenAI
from dotenv import load_dotenv
from PIL import Image
import torch
from transformers import CLIPProcessor, CLIPModel

# Optional imports for document handling
try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    from docx import Document
except ImportError:
    Document = None

try:
    from pptx import Presentation
except ImportError:
    Presentation = None

# Load environment variables
root_env_path = Path(__file__).parent.parent / ".env"

if root_env_path.exists():
    load_dotenv(dotenv_path=root_env_path, override=True)
else:
    load_dotenv(override=True)

# Configuration
INPUT_DIR = Path(__file__).parent.parent / "input"
DB_PATH = Path(__file__).parent / "database.sqlite"
EMBEDDING_MODEL = "text-embedding-3-large"
EMBEDDING_DIMENSIONS = 3072
CLIP_EMBEDDING_DIMENSIONS = 512
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100

# File Extensions
DOC_EXTENSIONS = {".pdf", ".docx", ".pptx", ".txt", ".md"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".mp4", ".mov", ".avi"} # Video treated as audio for transcription

# Global CLIP model cache
_clip_model = None
_clip_processor = None


def get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is required.")
    
    api_key = api_key.strip()
    if (api_key.startswith('"') and api_key.endswith('"')) or \
       (api_key.startswith("'") and api_key.endswith("'")):
        api_key = api_key[1:-1].strip()
    
    return OpenAI(api_key=api_key)


def get_clip_model():
    global _clip_model, _clip_processor
    if _clip_model is None or _clip_processor is None:
        print("Loading CLIP model...")
        model_name = "openai/clip-vit-base-patch32"
        _clip_model = CLIPModel.from_pretrained(model_name)
        _clip_processor = CLIPProcessor.from_pretrained(model_name)
        
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _clip_model = _clip_model.to(device)
        _clip_model.eval()
        print(f"CLIP model loaded on {device}")
    return _clip_model, _clip_processor


def extract_text_from_pdf(pdf_path: Path) -> str:
    if not pdfplumber:
        print("pdfplumber not installed. Skipping PDF.")
        return ""
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        print(f"Error extracting text from {pdf_path}: {e}")
    return text


def extract_text_from_docx(docx_path: Path) -> str:
    if not Document:
        print("python-docx not installed. Skipping DOCX.")
        return ""
    try:
        doc = Document(docx_path)
        return "\n".join([para.text for para in doc.paragraphs])
    except Exception as e:
        print(f"Error extracting text from {docx_path}: {e}")
        return ""


def extract_text_from_pptx(pptx_path: Path) -> str:
    if not Presentation:
        print("python-pptx not installed. Skipping PPTX.")
        return ""
    text = []
    try:
        prs = Presentation(pptx_path)
        for slide in prs.slides:
            for shape in slide.shapes:
                if hasattr(shape, "text"):
                    text.append(shape.text)
        return "\n".join(text)
    except Exception as e:
        print(f"Error extracting text from {pptx_path}: {e}")
        return ""


def extract_text_from_txt(txt_path: Path) -> str:
    try:
        return txt_path.read_text(encoding='utf-8')
    except Exception as e:
        print(f"Error extracting text from {txt_path}: {e}")
        return ""


def transcribe_audio(client: OpenAI, audio_path: Path) -> str:
    try:
        print(f"Transcribing {audio_path.name}...")
        with open(audio_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file
            )
        return transcription.text
    except Exception as e:
        print(f"Error transcribing {audio_path}: {e}")
        return ""


def get_image_embedding(image_path: Path) -> list[float]:
    try:
        model, processor = get_clip_model()
        image = Image.open(image_path).convert("RGB")
        inputs = processor(images=image, return_tensors="pt")
        
        device = next(model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            embedding = image_features[0].cpu().numpy().tolist()
        return embedding
    except Exception as e:
        print(f"Error processing image {image_path}: {e}")
        raise


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    encoding = tiktoken.get_encoding("cl100k_base")
    tokens = encoding.encode(text)
    
    chunks = []
    start = 0
    while start < len(tokens):
        end = start + chunk_size
        chunk_tokens = tokens[start:end]
        chunk_text = encoding.decode(chunk_tokens)
        chunks.append(chunk_text.strip())
        start = end - overlap
        if end >= len(tokens):
            break
    return [c for c in chunks if c]


def get_embedding(client: OpenAI, text: str) -> list[float]:
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=text)
    return response.data[0].embedding


def serialize_embedding(embedding: list[float]) -> bytes:
    return struct.pack(f"{len(embedding)}f", *embedding)


def init_database(db_path: Path) -> sqlite3.Connection:
    if db_path.exists():
        db_path.unlink()
    
    conn = sqlite3.connect(str(db_path))
    conn.enable_load_extension(True)
    try:
        conn.load_extension("vss0")
        conn.load_extension("vector0")
    except Exception as e:
        print(f"Note: VSS extension loading: {e}")
    conn.enable_load_extension(False)
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            content_type TEXT NOT NULL,
            chunk_text TEXT NOT NULL,
            embedding BLOB NOT NULL,
            embedding_dimensions INTEGER NOT NULL
        )
    """)
    
    try:
        conn.execute(f"CREATE VIRTUAL TABLE IF NOT EXISTS vss_documents_text USING vss0(embedding({EMBEDDING_DIMENSIONS}))")
        conn.execute(f"CREATE VIRTUAL TABLE IF NOT EXISTS vss_documents_image USING vss0(embedding({CLIP_EMBEDDING_DIMENSIONS}))")
    except Exception:
        pass
    
    conn.commit()
    return conn


def insert_document(conn, file_name, content_type, chunk_text, embedding, dims):
    embedding_bytes = serialize_embedding(embedding)
    cursor = conn.execute(
        "INSERT INTO documents (file_name, content_type, chunk_text, embedding, embedding_dimensions) VALUES (?, ?, ?, ?, ?)",
        (file_name, content_type, chunk_text, embedding_bytes, dims)
    )
    doc_id = cursor.lastrowid
    
    try:
        table = "vss_documents_text" if content_type == "text" else "vss_documents_image"
        conn.execute(f"INSERT INTO {table} (rowid, embedding) VALUES (?, ?)", (doc_id, embedding_bytes))
    except Exception:
        pass
    return doc_id


def build_index():
    print(f"Building index from {INPUT_DIR}")
    client = get_openai_client()
    
    # Initialize CLIP only if needed (images present)
    has_images = any(f.suffix.lower() in IMAGE_EXTENSIONS for f in INPUT_DIR.iterdir() if f.is_file())
    if has_images:
        get_clip_model()
    
    conn = init_database(DB_PATH)
    total_chunks = 0
    
    for file_path in INPUT_DIR.iterdir():
        if not file_path.is_file():
            continue
            
        ext = file_path.suffix.lower()
        print(f"\nProcessing {file_path.name}")
        
        text = ""
        embedding_type = "text"
        embedding_dims = EMBEDDING_DIMENSIONS
        
        try:
            if ext == ".pdf":
                text = extract_text_from_pdf(file_path)
            elif ext == ".docx":
                text = extract_text_from_docx(file_path)
            elif ext == ".pptx":
                text = extract_text_from_pptx(file_path)
            elif ext in [".txt", ".md"]:
                text = extract_text_from_txt(file_path)
            elif ext in AUDIO_EXTENSIONS:
                text = transcribe_audio(client, file_path)
            elif ext in IMAGE_EXTENSIONS:
                embedding = get_image_embedding(file_path)
                chunk_text = f"Image: {file_path.name}"
                insert_document(conn, file_path.name, "image", chunk_text, embedding, CLIP_EMBEDDING_DIMENSIONS)
                total_chunks += 1
                print(f"  ✓ Indexed image {file_path.name}")
                continue
            else:
                print(f"  Skipping unsupported file: {file_path.name}")
                continue
            
            if not text.strip():
                print(f"  No text extracted from {file_path.name}")
                continue
            
            chunks = chunk_text(text)
            print(f"  Created {len(chunks)} chunks")
            
            for i, chunk in enumerate(chunks):
                embedding = get_embedding(client, chunk)
                insert_document(conn, file_path.name, "text", chunk, embedding, EMBEDDING_DIMENSIONS)
                total_chunks += 1
                print(f"  Indexed chunk {i + 1}/{len(chunks)}", end="\r")
            print(f"\n  ✓ Completed {file_path.name}")
            
        except Exception as e:
            print(f"  ❌ Error processing {file_path.name}: {e}")
    
    conn.commit()
    conn.close()
    print(f"\n\nIndexing complete! Total chunks: {total_chunks}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", action="store_true", help="Build index")
    args = parser.parse_args()
    
    if args.build:
        build_index()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
