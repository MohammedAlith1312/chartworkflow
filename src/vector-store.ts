import { Pool } from "pg";
import OpenAI from "openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// Use same DB as Voltagent memory
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// OpenRouter via OpenAI-compatible client
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3141",
    "X-Title": "voltagent-app",
  },
});

// ---------- Text splitter ----------
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 150,
  chunkOverlap: 20,
  separators: ["\n\n", "\n", " ", ""],
});

async function splitIntoChunks(text: string): Promise<string[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return textSplitter.splitText(trimmed);
}

// ---------- Embeddings ----------
async function getEmbedding(text: string): Promise<number[]> {
  const input = text.trim();
  if (!input) {
    throw new Error("Cannot create embedding for empty text");
  }

  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input,
  });

  const emb = res.data[0]?.embedding;
  if (!emb || emb.length === 0) {
    throw new Error("Empty embedding returned");
  }

  return emb;
}

// ---------- INGEST ----------
export async function ingestDocumentText(text: string) {
  const chunks = await splitIntoChunks(text);
  if (!chunks.length) return;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await getEmbedding(chunk);
    const embeddingLiteral = `[${embedding.join(",")}]`;

    await pool.query(
      `
      INSERT INTO documents (content, embedding, chunk_index)
      VALUES ($1, $2::vector, $3)
      `,
      [chunk, embeddingLiteral, i]
    );
  }
}

// ---------- SEARCH (FIXED) ----------
export async function searchDocumentsByQuery(query: string, limit = 5) {
  const q = query.trim();
  if (!q) return [];

  const embedding = await getEmbedding(q);
  const embeddingLiteral = `[${embedding.join(",")}]`;

  type Row = {
    id: number;
    content: string;
    similarity: number;
  };

  const res = await pool.query<Row>(
    `
    SELECT
      id,
      content,
      1 - (embedding <=> $1::vector) AS similarity
    FROM documents
    ORDER BY similarity DESC
    LIMIT $2
    `,
    [embeddingLiteral, limit]
  );

  return res.rows;
}

// ---------- OPTIONAL ----------
export async function closeVectorStore() {
  await pool.end();
}
