import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always load from .env file, ignoring any global environment variables
const envPath = path.join(__dirname, "..", ".env");

// Temporarily unset the environment variable to ensure .env takes precedence
delete process.env.OPENAI_API_KEY;

// Load .env file
const result = dotenv.config({ path: envPath });

if (result.error) {
  throw new Error(`Failed to load .env file: ${result.error.message}`);
}

// Read the key directly from .env file to ensure we're using it
const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n');
const apiKeyLine = envLines.find(line => line.startsWith('OPENAI_API_KEY='));

if (!apiKeyLine) {
  throw new Error("OPENAI_API_KEY not found in .env file");
}

const apiKey = apiKeyLine.split('=')[1]?.trim();
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is empty in .env file");
}

// Force set the API key from .env file
process.env.OPENAI_API_KEY = apiKey;

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required. Please check your .env file.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default openai;
