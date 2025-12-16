import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import fetch from "node-fetch"; // Node.js 18+ has global fetch, but if not we might need it.
                               // Actually let's assume global fetch is available or use 'undici'
import openai from "./openaiClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "..", "indexer", "database.sqlite");
const EMBEDDING_MODEL = "text-embedding-3-large";
const TEXT_EMBED_DIM = 3072;
const HF_CLIP_MODEL = "openai/clip-vit-base-patch32";
const HF_CLAP_MODEL = "laion/clap-htsat-unfused";
const CLIP_DIM = 512;
const CLAP_DIM = 512;

// Polyfill check for fetch
if (!global.fetch) {
  // If running in older node, we'd need to install it. 
  // Assuming Node 18+ environment provided by cursor usually.
}

async function getQueryEmbedding(query) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });
  return response.data[0].embedding;
}

// Helper to query HF API
async function queryHfApi(modelId, data) {
  const token = process.env.HUGGINGFACE_API_KEY;
  if (!token) return null;
  
  const response = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) return null;
  return await response.json();
}

async function getClipTextEmbedding(query) {
  // For CLIP text embedding via HF, strictly speaking we need the 'feature-extraction' of the text
  // passed through the CLIP text encoder.
  // HF 'feature-extraction' pipeline usually does this if you send text.
  // We send { inputs: "string" }
  try {
    const res = await queryHfApi(HF_CLIP_MODEL, { inputs: query });
    // Result can be [embedding] or [[embedding]]
    if (Array.isArray(res)) {
      if (Array.isArray(res[0])) return res[0]; // Batched
      return res; // Single
    }
    return null;
  } catch (e) {
    console.error("CLIP Embed Error:", e);
    return null;
  }
}

async function getClapTextEmbedding(query) {
  // CLAP text embedding
  try {
    const res = await queryHfApi(HF_CLAP_MODEL, { inputs: query });
    if (Array.isArray(res)) {
      if (Array.isArray(res[0])) return res[0];
      return res;
    }
    return null;
  } catch (e) {
    console.error("CLAP Embed Error:", e);
    return null;
  }
}

function deserializeEmbedding(buffer) {
  const floats = [];
  for (let i = 0; i < buffer.length; i += 4) {
    floats.push(buffer.readFloatLE(i));
  }
  return floats;
}

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

// Generic search function for a specific table/embedding
function searchTable(db, tableName, queryEmbedding, type, topK, dim) {
  if (!queryEmbedding) return [];
  
  let results = [];
  const buffer = Buffer.alloc(dim * 4);
  for (let i = 0; i < queryEmbedding.length; i++) {
    buffer.writeFloatLE(queryEmbedding[i], i * 4);
  }

  // Try VSS
  try {
    // Determine VSS table name
    const vssTable = `vss_${type}`; // vss_text, vss_image, vss_audio
    
    // Check if table exists (quick check via select or try/catch)
    const vssResults = db.prepare(`
      SELECT 
        d.id, d.file_name, d.content_type, d.chunk_text, d.metadata, v.distance
      FROM ${vssTable} v
      JOIN documents d ON d.id = v.rowid
      WHERE vss_search(v.embedding, ?)
      LIMIT ?
    `).all(buffer, topK);
    
    if (vssResults.length > 0) {
      return vssResults.map(r => ({
        id: r.id,
        file_name: r.file_name,
        content_type: r.content_type || type,
        chunk_text: r.chunk_text,
        metadata: r.metadata,
        // Convert distance to similarity or just pass it
        // VSS returns L2 distance usually? Or Inner Product? Depends on config. 
        // Assuming relevance.
      }));
    }
  } catch (e) {
    // console.log(`VSS search failed for ${type}: ${e.message}`);
  }

  // Fallback Brute Force
  const docs = db.prepare(`SELECT id, file_name, content_type, chunk_text, embedding, metadata FROM documents WHERE content_type = ?`).all(type);
  const sims = docs.map(doc => {
    const emb = deserializeEmbedding(doc.embedding);
    // Safety check dim
    if (emb.length !== dim) return null;
    return {
      id: doc.id,
      file_name: doc.file_name,
      content_type: doc.content_type,
      chunk_text: doc.chunk_text,
      metadata: doc.metadata,
      similarity: cosineSimilarity(queryEmbedding, emb)
    };
  }).filter(r => r !== null);
  
  sims.sort((a, b) => b.similarity - a.similarity);
  return sims.slice(0, topK);
}

export async function searchPdfs(query, topK = 5) {
  if (!fs.existsSync(DB_PATH)) return [];
  const db = new Database(DB_PATH, { readonly: true });
  
  try {
    const allResults = [];

    // 1. Text Search
    const textEmb = await getQueryEmbedding(query);
    const textRes = searchTable(db, "documents", textEmb, "text", topK, TEXT_EMBED_DIM);
    allResults.push(...textRes);

    // 2. Image Search (CLIP)
    const clipEmb = await getClipTextEmbedding(query);
    if (clipEmb) {
      const imgRes = searchTable(db, "documents", clipEmb, "image", topK, CLIP_DIM);
      allResults.push(...imgRes);
    }

    // 3. Audio Search (CLAP)
    const clapEmb = await getClapTextEmbedding(query);
    if (clapEmb) {
      const audioRes = searchTable(db, "documents", clapEmb, "audio", topK, CLAP_DIM);
      allResults.push(...audioRes);
    }

    // Sort by relevance (if we had unified scoring, for now we mix)
    // Actually we should probably just return them all and let LLM sort it out
    // or limit the total size.
    return allResults.slice(0, topK * 3); 
  } finally {
    db.close();
  }
}

export function getIndexedFiles() {
  if (!fs.existsSync(DB_PATH)) return [];
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const files = db.prepare("SELECT DISTINCT file_name FROM documents ORDER BY file_name").all();
    return files.map(f => f.file_name);
  } finally {
    db.close();
  }
}

export const searchPdfsTool = {
  type: "function",
  function: {
    name: "search_pdfs",
    description: "Searches indexed documents (text, image, audio) using vector similarity.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        top_k: { type: "number", description: "Results count" }
      },
      required: ["query"]
    }
  }
};
