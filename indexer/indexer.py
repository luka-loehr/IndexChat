#!/usr/bin/env python3
"""
IndexChat PDF & Image Indexer
Indexes PDF documents and images into SQLite-VSS for vector search.
"""

import argparse
import os
import struct
import sqlite3
from pathlib import Path

import pdfplumber
import tiktoken
from openai import OpenAI
from dotenv import load_dotenv
from PIL import Image
import torch
from transformers import CLIPProcessor, CLIPModel

# Load environment variables from root .env file
# Use override=True to ensure .env file takes precedence over existing environment variables
root_env_path = Path(__file__).parent.parent / ".env"

if root_env_path.exists():
    load_dotenv(dotenv_path=root_env_path, override=True)
    print(f"Loaded .env from: {root_env_path}")
else:
    print("Warning: No .env file found in root directory. Trying to load from environment variables.")
    load_dotenv(override=True)  # Try loading from current directory or environment

# Configuration
INPUT_DIR = Path(__file__).parent.parent / "input"
DB_PATH = Path(__file__).parent / "database.sqlite"
EMBEDDING_MODEL = "text-embedding-3-large"
EMBEDDING_DIMENSIONS = 3072
CLIP_EMBEDDING_DIMENSIONS = 512  # CLIP produces 512-dimensional embeddings
CHUNK_SIZE = 800  # tokens
CHUNK_OVERLAP = 100  # tokens

# Supported image formats
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}


# Global CLIP model cache
_clip_model = None
_clip_processor = None


def get_openai_client() -> OpenAI:
    """Create and return OpenAI client."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError(
            "OPENAI_API_KEY environment variable is required. "
            "Please create .env file in the root directory with your API key."
        )
    
    # Strip whitespace and newlines that might be in the .env file
    api_key = api_key.strip()
    
    # Remove quotes if present (sometimes .env files have quoted values)
    if (api_key.startswith('"') and api_key.endswith('"')) or \
       (api_key.startswith("'") and api_key.endswith("'")):
        api_key = api_key[1:-1].strip()
    
    if not api_key:
        raise ValueError(
            "OPENAI_API_KEY is empty after stripping whitespace. "
            "Please check your .env file."
        )
    
    # Basic validation - OpenAI API keys start with 'sk-'
    if not api_key.startswith("sk-"):
        raise ValueError(
            f"Invalid API key format. OpenAI API keys should start with 'sk-'. "
            f"Got: {api_key[:20]}... (length: {len(api_key)})"
        )
    
    return OpenAI(api_key=api_key)


def get_clip_model():
    """Get or initialize CLIP model and processor."""
    global _clip_model, _clip_processor
    
    if _clip_model is None or _clip_processor is None:
        print("Loading CLIP model...")
        model_name = "openai/clip-vit-base-patch32"
        _clip_model = CLIPModel.from_pretrained(model_name)
        _clip_processor = CLIPProcessor.from_pretrained(model_name)
        
        # Use CPU if CUDA is not available
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _clip_model = _clip_model.to(device)
        _clip_model.eval()
        print(f"CLIP model loaded on {device}")
    
    return _clip_model, _clip_processor


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract all text from a PDF file."""
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


def get_image_embedding(image_path: Path) -> list[float]:
    """Get embedding vector for an image using CLIP model."""
    try:
        model, processor = get_clip_model()
        
        # Load and process image
        image = Image.open(image_path).convert("RGB")
        inputs = processor(images=image, return_tensors="pt")
        
        # Move inputs to same device as model
        device = next(model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        # Get image embedding
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)
            # Normalize the embedding
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            embedding = image_features[0].cpu().numpy().tolist()
        
        return embedding
    except Exception as e:
        print(f"Error processing image {image_path}: {e}")
        raise


def count_tokens(text: str, encoding_name: str = "cl100k_base") -> int:
    """Count the number of tokens in a text string."""
    encoding = tiktoken.get_encoding(encoding_name)
    return len(encoding.encode(text))


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into chunks of approximately chunk_size tokens with overlap."""
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
    
    return [c for c in chunks if c]  # Filter empty chunks


def get_embedding(client: OpenAI, text: str) -> list[float]:
    """Get embedding vector for text using OpenAI API."""
    try:
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        # Provide more helpful error messages
        error_msg = str(e)
        if "401" in error_msg or "invalid_api_key" in error_msg.lower():
            raise ValueError(
                "Invalid or expired OpenAI API key. "
                "Please check your API key in the .env file. "
                "You can get a new key at https://platform.openai.com/account/api-keys"
            ) from e
        elif "429" in error_msg or "rate_limit" in error_msg.lower():
            raise ValueError(
                "OpenAI API rate limit exceeded. Please wait a moment and try again."
            ) from e
        else:
            raise


def serialize_embedding(embedding: list[float]) -> bytes:
    """Serialize embedding to bytes for SQLite storage."""
    return struct.pack(f"{len(embedding)}f", *embedding)


def init_database(db_path: Path) -> sqlite3.Connection:
    """Initialize SQLite database with VSS extension."""
    # Remove existing database
    if db_path.exists():
        db_path.unlink()
    
    conn = sqlite3.connect(str(db_path))
    conn.enable_load_extension(True)
    
    # Load VSS extension
    try:
        conn.load_extension("vss0")
        conn.load_extension("vector0")
    except Exception as e:
        print(f"Note: VSS extension loading: {e}")
        print("Continuing with standard SQLite (vector search will use brute force)")
    
    conn.enable_load_extension(False)
    
    # Create documents table with content_type field
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
    
    # Try to create VSS virtual tables for both text and images
    try:
        # VSS table for text embeddings (OpenAI - 3072 dimensions)
        conn.execute(f"""
            CREATE VIRTUAL TABLE IF NOT EXISTS vss_documents_text USING vss0(
                embedding({EMBEDDING_DIMENSIONS})
            )
        """)
        # VSS table for image embeddings (CLIP - 512 dimensions)
        conn.execute(f"""
            CREATE VIRTUAL TABLE IF NOT EXISTS vss_documents_image USING vss0(
                embedding({CLIP_EMBEDDING_DIMENSIONS})
            )
        """)
    except Exception as e:
        print(f"VSS virtual table not created: {e}")
    
    conn.commit()
    return conn


def insert_document(
    conn: sqlite3.Connection, 
    file_name: str, 
    content_type: str,
    chunk_text: str, 
    embedding: list[float],
    embedding_dimensions: int
) -> int:
    """Insert a document chunk into the database."""
    embedding_bytes = serialize_embedding(embedding)
    
    cursor = conn.execute(
        "INSERT INTO documents (file_name, content_type, chunk_text, embedding, embedding_dimensions) VALUES (?, ?, ?, ?, ?)",
        (file_name, content_type, chunk_text, embedding_bytes, embedding_dimensions)
    )
    doc_id = cursor.lastrowid
    
    # Try to insert into appropriate VSS index based on content type
    try:
        if content_type == "text":
            conn.execute(
                "INSERT INTO vss_documents_text (rowid, embedding) VALUES (?, ?)",
                (doc_id, embedding_bytes)
            )
        elif content_type == "image":
            conn.execute(
                "INSERT INTO vss_documents_image (rowid, embedding) VALUES (?, ?)",
                (doc_id, embedding_bytes)
            )
    except Exception:
        pass  # VSS not available
    
    return doc_id


def build_index():
    """Build the complete index from all PDFs and images in input directory."""
    print(f"Building index from PDFs and images in {INPUT_DIR}")
    
    # Validate API key before starting
    try:
        client = get_openai_client()
        # Test the API key with a simple request
        print("Validating API key...")
        test_response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input="test"
        )
        print("✓ API key is valid")
    except Exception as e:
        print(f"\n❌ API key validation failed: {e}")
        print("\nPlease check:")
        print("  1. Your OPENAI_API_KEY in the root .env file")
        print("  2. The API key is valid and not expired")
        print("  3. You have sufficient credits in your OpenAI account")
        print("\nGet a new API key at: https://platform.openai.com/account/api-keys")
        raise
    
    # Initialize CLIP model
    print("Initializing CLIP model...")
    get_clip_model()
    print("✓ CLIP model ready")
    
    # Get all PDF and image files
    pdf_files = list(INPUT_DIR.glob("*.pdf"))
    image_files = [f for f in INPUT_DIR.iterdir() 
                   if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS]
    
    if not pdf_files and not image_files:
        print("No PDF or image files found in input directory")
        return
    
    print(f"Found {len(pdf_files)} PDF files and {len(image_files)} image files")
    
    # Initialize database
    conn = init_database(DB_PATH)
    
    total_chunks = 0
    
    # Process PDF files
    for pdf_path in pdf_files:
        print(f"\nProcessing PDF: {pdf_path.name}")
        
        # Extract text
        text = extract_text_from_pdf(pdf_path)
        if not text.strip():
            print(f"  No text extracted from {pdf_path.name}")
            continue
        
        # Chunk text
        chunks = chunk_text(text)
        print(f"  Created {len(chunks)} chunks")
        
        # Embed and store each chunk
        for i, chunk in enumerate(chunks):
            try:
                embedding = get_embedding(client, chunk)
                insert_document(
                    conn, 
                    pdf_path.name, 
                    "text",
                    chunk, 
                    embedding,
                    EMBEDDING_DIMENSIONS
                )
                total_chunks += 1
                print(f"  Indexed chunk {i + 1}/{len(chunks)}", end="\r")
            except ValueError as e:
                # API key or configuration errors - stop processing
                print(f"\n  ❌ Fatal error: {e}")
                print(f"  Stopping indexing. Please fix the issue and try again.")
                conn.close()
                raise
            except Exception as e:
                # Other errors - log and continue
                error_type = type(e).__name__
                error_msg = str(e)
                if "401" in error_msg:
                    print(f"\n  ❌ API key error on chunk {i}: Invalid API key")
                    print(f"  Please check your OPENAI_API_KEY in the root .env file")
                    conn.close()
                    raise ValueError("Invalid API key - stopping indexing") from e
                else:
                    print(f"  ⚠️  Error embedding chunk {i}: {error_type}: {error_msg}")
        
        print(f"  Completed {pdf_path.name}")
    
    # Process image files
    for image_path in image_files:
        print(f"\nProcessing image: {image_path.name}")
        
        try:
            embedding = get_image_embedding(image_path)
            # Store image with a placeholder text (filename)
            chunk_text = f"Image: {image_path.name}"
            insert_document(
                conn,
                image_path.name,
                "image",
                chunk_text,
                embedding,
                CLIP_EMBEDDING_DIMENSIONS
            )
            total_chunks += 1
            print(f"  ✓ Indexed {image_path.name}")
        except Exception as e:
            error_type = type(e).__name__
            error_msg = str(e)
            print(f"  ⚠️  Error processing image {image_path.name}: {error_type}: {error_msg}")
    
    conn.commit()
    conn.close()
    
    print(f"\n\nIndexing complete!")
    print(f"Total chunks indexed: {total_chunks}")
    print(f"Database saved to: {DB_PATH}")


def main():
    parser = argparse.ArgumentParser(description="IndexChat PDF Indexer")
    parser.add_argument("--build", action="store_true", help="Build index from all PDFs")
    args = parser.parse_args()
    
    if args.build:
        build_index()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
