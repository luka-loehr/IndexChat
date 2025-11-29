import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import openai from "./openaiClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "..", "indexer", "database.sqlite");
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 3072;

/**
 * Get embedding vector for a query string
 */
async function getQueryEmbedding(query) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });
  return response.data[0].embedding;
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
 * Search PDFs using vector similarity
 * @param {string} query - The search query
 * @param {number} topK - Number of results to return
 * @returns {Array} Array of matching chunks with file_name, id, and chunk_text
 */
export async function searchPdfs(query, topK = 5) {
  // Check if database exists
  const db = new Database(DB_PATH, { readonly: true });

  try {
    // Get query embedding
    const queryEmbedding = await getQueryEmbedding(query);

    // Try VSS search first
    let results = [];
    try {
      // Serialize query embedding for VSS
      const embeddingBuffer = Buffer.alloc(EMBEDDING_DIMENSIONS * 4);
      for (let i = 0; i < queryEmbedding.length; i++) {
        embeddingBuffer.writeFloatLE(queryEmbedding[i], i * 4);
      }

      const vssResults = db
        .prepare(
          `
        SELECT 
          d.id,
          d.file_name,
          d.chunk_text,
          vss_documents.distance
        FROM vss_documents
        JOIN documents d ON d.id = vss_documents.rowid
        WHERE vss_search(vss_documents.embedding, ?)
        LIMIT ?
      `
        )
        .all(embeddingBuffer, topK);

      if (vssResults.length > 0) {
        results = vssResults.map((row) => ({
          id: row.id,
          file_name: row.file_name,
          chunk_text: row.chunk_text,
        }));
      }
    } catch (vssError) {
      // VSS not available, fall back to brute force
      console.log("VSS not available, using brute force similarity search");
    }

    // Fall back to brute force if VSS didn't work
    if (results.length === 0) {
      const allDocs = db
        .prepare("SELECT id, file_name, chunk_text, embedding FROM documents")
        .all();

      // Calculate similarity for all documents
      const similarities = allDocs.map((doc) => {
        const docEmbedding = deserializeEmbedding(doc.embedding);
        const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
        return {
          id: doc.id,
          file_name: doc.file_name,
          chunk_text: doc.chunk_text,
          similarity,
        };
      });

      // Sort by similarity and take top K
      similarities.sort((a, b) => b.similarity - a.similarity);
      results = similarities.slice(0, topK).map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
        chunk_text: doc.chunk_text,
      }));
    }

    return results;
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
      "Searches the indexed PDF documents using vector similarity and returns relevant text chunks along with their source file names. Use this to find information from the user's PDF documents.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant document chunks",
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
