#!/usr/bin/env python3
"""
IndexChat PDF Indexer
Indexes PDF documents into SQLite-VSS for vector search.
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

# Load environment variables
load_dotenv(dotenv_path=Path(__file__).parent.parent / "server" / ".env")

# Configuration
INPUT_DIR = Path(__file__).parent.parent / "input"
DB_PATH = Path(__file__).parent / "database.sqlite"
EMBEDDING_MODEL = "text-embedding-3-large"
EMBEDDING_DIMENSIONS = 3072
CHUNK_SIZE = 800  # tokens
CHUNK_OVERLAP = 100  # tokens


def get_openai_client() -> OpenAI:
    """Create and return OpenAI client."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is required")
    return OpenAI(api_key=api_key)


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
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text
    )
    return response.data[0].embedding


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
    
    # Create documents table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            chunk_text TEXT NOT NULL,
            embedding BLOB NOT NULL
        )
    """)
    
    # Try to create VSS virtual table
    try:
        conn.execute(f"""
            CREATE VIRTUAL TABLE IF NOT EXISTS vss_documents USING vss0(
                embedding({EMBEDDING_DIMENSIONS})
            )
        """)
    except Exception as e:
        print(f"VSS virtual table not created: {e}")
    
    conn.commit()
    return conn


def insert_document(conn: sqlite3.Connection, file_name: str, chunk_text: str, embedding: list[float]) -> int:
    """Insert a document chunk into the database."""
    embedding_bytes = serialize_embedding(embedding)
    
    cursor = conn.execute(
        "INSERT INTO documents (file_name, chunk_text, embedding) VALUES (?, ?, ?)",
        (file_name, chunk_text, embedding_bytes)
    )
    doc_id = cursor.lastrowid
    
    # Try to insert into VSS index
    try:
        conn.execute(
            "INSERT INTO vss_documents (rowid, embedding) VALUES (?, ?)",
            (doc_id, embedding_bytes)
        )
    except Exception:
        pass  # VSS not available
    
    return doc_id


def build_index():
    """Build the complete index from all PDFs in input directory."""
    print(f"Building index from PDFs in {INPUT_DIR}")
    
    # Get all PDF files
    pdf_files = list(INPUT_DIR.glob("*.pdf"))
    if not pdf_files:
        print("No PDF files found in input directory")
        return
    
    print(f"Found {len(pdf_files)} PDF files")
    
    # Initialize database
    conn = init_database(DB_PATH)
    client = get_openai_client()
    
    total_chunks = 0
    
    for pdf_path in pdf_files:
        print(f"\nProcessing: {pdf_path.name}")
        
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
                insert_document(conn, pdf_path.name, chunk, embedding)
                total_chunks += 1
                print(f"  Indexed chunk {i + 1}/{len(chunks)}", end="\r")
            except Exception as e:
                print(f"  Error embedding chunk {i}: {e}")
        
        print(f"  Completed {pdf_path.name}")
    
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
