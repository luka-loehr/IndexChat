import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import openai from "./openaiClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "..", "indexer", "database.sqlite");
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 3072;
const CLIP_EMBEDDING_DIMENSIONS = 512;

/**
 * Get embedding vector for a query string using OpenAI
 */
async function getQueryEmbedding(query) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });
  return response.data[0].embedding;
}

/**
 * Get CLIP text embedding for image search
 */
function getClipTextEmbedding(query) {
  try {
    const scriptPath = path.join(__dirname, "..", "indexer", "clip_embed.py");
    const result = execSync(
      `python3 "${scriptPath}" "${query.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
    const embedding = JSON.parse(result.trim());
    return embedding;
  } catch (error) {
    console.error("Error getting CLIP embedding:", error);
    return null;
  }
}

/**
 * Deserialize embedding from SQLite BLOB
 */
function deserializeEmbedding(buffer) {
  const floats = [];
  for (let i = 0; i < buffer.length; i += 4) {
    floats.push(buffer.readFloatLE(i));
  }
  return floats;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search documents (PDFs and images) using vector similarity
 * @param {string} query - The search query
 * @param {number} topK - Number of results to return
 * @returns {Array} Array of matching chunks with file_name, id, chunk_text, and content_type
 */
export async function searchPdfs(query, topK = 5) {
  // Check if database exists
  if (!fs.existsSync(DB_PATH)) {
    return [];
  }

  const db = new Database(DB_PATH, { readonly: true });
  const allResults = [];

  try {
    // Search text documents (PDFs) using OpenAI embeddings
    const textQueryEmbedding = await getQueryEmbedding(query);
    let textResults = [];

    try {
      // Try VSS search for text
      const embeddingBuffer = Buffer.alloc(EMBEDDING_DIMENSIONS * 4);
      for (let i = 0; i < textQueryEmbedding.length; i++) {
        embeddingBuffer.writeFloatLE(textQueryEmbedding[i], i * 4);
      }

      const vssTextResults = db
        .prepare(
          `
        SELECT 
          d.id,
          d.file_name,
          d.content_type,
          d.chunk_text,
          vss_documents_text.distance
        FROM vss_documents_text
        JOIN documents d ON d.id = vss_documents_text.rowid
        WHERE d.content_type = 'text' AND vss_search(vss_documents_text.embedding, ?)
        LIMIT ?
      `
        )
        .all(embeddingBuffer, topK);

      if (vssTextResults.length > 0) {
        textResults = vssTextResults.map((row) => ({
          id: row.id,
          file_name: row.file_name,
          content_type: row.content_type || "text",
          chunk_text: row.chunk_text,
        }));
      }
    } catch (vssError) {
      // VSS not available, fall back to brute force
    }

    // Fall back to brute force for text if VSS didn't work
    if (textResults.length === 0) {
      const allTextDocs = db
        .prepare(
          "SELECT id, file_name, content_type, chunk_text, embedding FROM documents WHERE content_type = 'text'"
        )
        .all();

      const similarities = allTextDocs.map((doc) => {
        const docEmbedding = deserializeEmbedding(doc.embedding);
        const similarity = cosineSimilarity(textQueryEmbedding, docEmbedding);
        return {
          id: doc.id,
          file_name: doc.file_name,
          content_type: doc.content_type || "text",
          chunk_text: doc.chunk_text,
          similarity,
        };
      });

      similarities.sort((a, b) => b.similarity - a.similarity);
      textResults = similarities.slice(0, topK).map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
        content_type: doc.content_type || "text",
        chunk_text: doc.chunk_text,
      }));
    }

    allResults.push(...textResults);

    // Search images using CLIP embeddings
    const clipQueryEmbedding = getClipTextEmbedding(query);
    if (clipQueryEmbedding) {
      let imageResults = [];

      try {
        // Try VSS search for images
        const clipEmbeddingBuffer = Buffer.alloc(CLIP_EMBEDDING_DIMENSIONS * 4);
        for (let i = 0; i < clipQueryEmbedding.length; i++) {
          clipEmbeddingBuffer.writeFloatLE(clipQueryEmbedding[i], i * 4);
        }

        const vssImageResults = db
          .prepare(
            `
          SELECT 
            d.id,
            d.file_name,
            d.content_type,
            d.chunk_text,
            vss_documents_image.distance
          FROM vss_documents_image
          JOIN documents d ON d.id = vss_documents_image.rowid
          WHERE d.content_type = 'image' AND vss_search(vss_documents_image.embedding, ?)
          LIMIT ?
        `
          )
          .all(clipEmbeddingBuffer, topK);

        if (vssImageResults.length > 0) {
          imageResults = vssImageResults.map((row) => ({
            id: row.id,
            file_name: row.file_name,
            content_type: row.content_type || "image",
            chunk_text: row.chunk_text,
          }));
        }
      } catch (vssError) {
        // VSS not available, fall back to brute force
      }

      // Fall back to brute force for images if VSS didn't work
      if (imageResults.length === 0) {
        const allImageDocs = db
          .prepare(
            "SELECT id, file_name, content_type, chunk_text, embedding FROM documents WHERE content_type = 'image'"
          )
          .all();

        const similarities = allImageDocs.map((doc) => {
          const docEmbedding = deserializeEmbedding(doc.embedding);
          const similarity = cosineSimilarity(clipQueryEmbedding, docEmbedding);
          return {
            id: doc.id,
            file_name: doc.file_name,
            content_type: doc.content_type || "image",
            chunk_text: doc.chunk_text,
            similarity,
          };
        });

        similarities.sort((a, b) => b.similarity - a.similarity);
        imageResults = similarities.slice(0, topK).map((doc) => ({
          id: doc.id,
          file_name: doc.file_name,
          content_type: doc.content_type || "image",
          chunk_text: doc.chunk_text,
        }));
      }

      allResults.push(...imageResults);
    }

    // Sort all results and return top K (mix of text and images)
    // For now, just return all results up to topK
    return allResults.slice(0, topK);
  } finally {
    db.close();
  }
}

/**
 * Get list of all indexed files
 * @returns {Array} Array of unique file names
 */
export function getIndexedFiles() {
  // Return empty array if database doesn't exist yet
  if (!fs.existsSync(DB_PATH)) {
    return [];
  }

  const db = new Database(DB_PATH, { readonly: true });
  try {
    const files = db
      .prepare("SELECT DISTINCT file_name FROM documents ORDER BY file_name")
      .all();
    return files.map((f) => f.file_name);
  } finally {
    db.close();
  }
}

/**
 * Tool definition for OpenAI function calling
 */
export const searchPdfsTool = {
  type: "function",
  function: {
    name: "search_pdfs",
    description:
      "Searches the indexed PDF documents and images using vector similarity and returns relevant text chunks and images along with their source file names. Use this to find information from the user's PDF documents and images.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant document chunks and images",
        },
        top_k: {
          type: "number",
          description: "Number of top results to return (default: 5)",
        },
      },
      required: ["query"],
    },
  },
};
