import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";
import openai from "./openaiClient.js";
import { searchPdfs, searchPdfsTool, getIndexedFiles } from "./ragTools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root directory
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "..", "input");
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Keep original filename
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

// System prompt for the assistant
const SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the user's PDF documents.
When answering questions:
1. ALWAYS use the search_pdfs tool to find relevant information from the documents
2. Base your answers on the retrieved document chunks
3. ALWAYS cite your sources by mentioning which document (file name) the information came from
4. If the documents don't contain relevant information, say so clearly
5. Be concise but thorough in your answers`;

// Model Selection
const CHAT_MODEL = "gpt-4o";

/**
 * Process a user query with GPT-4 tool calling
 */
async function processQuery(query) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: query },
  ];

  const tools = [searchPdfsTool];
  const sources = [];

  // Initial call to GPT-4
  let response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    tools,
    tool_choice: "auto",
  });

  let assistantMessage = response.choices[0].message;

  // Handle tool calls in a loop (in case of multiple calls)
  while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    // Add assistant message to conversation
    messages.push(assistantMessage);

    // Process each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.function.name === "search_pdfs") {
        const args = JSON.parse(toolCall.function.arguments);
        const searchQuery = args.query;
        const topK = args.top_k || 5;

        console.log(`[Tool Call] search_pdfs: "${searchQuery}" (top_k: ${topK})`);

        try {
          // Execute the search
          const results = await searchPdfs(searchQuery, topK);

          // Track sources
          for (const result of results) {
            if (!sources.find((s) => s.id === result.id)) {
              sources.push({
                id: result.id,
                file_name: result.file_name,
              });
            }
          }

          // Format results for GPT
          const formattedResults = results
            .map(
              (r, i) =>
                `[${i + 1}] File: ${r.file_name} (Type: ${r.content_type || 'text'})\n${r.chunk_text}`
            )
            .join("\n\n---\n\n");

          const toolResponse =
            results.length > 0
              ? `Found ${results.length} relevant chunks:\n\n${formattedResults}`
              : "No relevant documents found for this query.";

          // Add tool response to messages
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResponse,
          });

          console.log(`[Tool Result] Found ${results.length} chunks`);
        } catch (error) {
          console.error(`[Tool Error] ${error.message}`);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Error searching documents: ${error.message}`,
          });
        }
      }
    }

    // Get next response from GPT
    response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      tools,
      tool_choice: "auto",
    });

    assistantMessage = response.choices[0].message;
  }

  return {
    answer: assistantMessage.content,
    sources,
  };
}

// Routes
app.post("/ask", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" });
    }

    console.log(`\n[Request] Query: "${query}"`);

    const result = await processQuery(query);

    console.log(`[Response] Answer length: ${result.answer.length} chars`);
    console.log(`[Response] Sources: ${result.sources.length} documents`);

    res.json(result);
  } catch (error) {
    console.error("[Error]", error);
    res.status(500).json({
      error: "Failed to process query",
      details: error.message,
    });
  }
});

// Upload files
app.post("/upload", upload.array("files"), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    console.log(`[Upload] Received ${req.files.length} files`);
    
    // The watcher will detect the new files and trigger indexing
    
    res.json({ 
      message: "Files uploaded successfully", 
      files: req.files.map(f => f.originalname) 
    });
  } catch (error) {
    console.error("[Error]", error);
    res.status(500).json({
      error: "Failed to upload files",
      details: error.message,
    });
  }
});

// Get indexed files
app.get("/files", (req, res) => {
  try {
    const files = getIndexedFiles();
    res.json({ files });
  } catch (error) {
    console.error("[Error]", error);
    res.status(500).json({
      error: "Failed to get indexed files",
      details: error.message,
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Function to find an available port
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = app.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port is in use, try the next one
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

// Start server with automatic port selection
findAvailablePort(PORT)
  .then((availablePort) => {
    app.listen(availablePort, () => {
      console.log("=".repeat(50));
      console.log("IndexChat Server");
      console.log("=".repeat(50));
      if (availablePort !== PORT) {
        console.log(`⚠️  Port ${PORT} was in use, using port ${availablePort} instead`);
      }
      console.log(`Server running on http://localhost:${availablePort}`);
      console.log(`\nEndpoints:`);
      console.log(`  POST /ask    - Ask a question`);
      console.log(`  POST /upload - Upload files`);
      console.log(`  GET  /files  - List indexed files`);
      console.log(`  GET  /health - Health check`);
      console.log("=".repeat(50));
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
