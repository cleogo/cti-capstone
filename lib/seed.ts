/**
 * Seed Upstash Vector with the CTI product corpus.
 *
 * Embeds corpus/products.jsonl (1,038 chunks, already atomic — not
 * re-chunked here) and corpus/guide/*.md (chunked by ## heading), then
 * upserts both into the same index with deterministic ids. Re-running is
 * safe: upsert is keyed by id, so a retry after a partial failure overwrites
 * rather than duplicates.
 *
 * Run once before starting the chat:
 *   npm run seed
 *
 * Pass --limit N to seed only the first N products (plus all guide chunks) —
 * useful as a cheap trial before the full run.
 *
 * BEGINNER'S MAP: this is STAGE 2 of 3, the actual "indexing".
 *
 *   corpus/products.jsonl ─┐
 *                          ├─> embed (OpenAI) ─> upsert (Upstash Vector)
 *   corpus/guide/*.md ─────┘
 *
 * - EMBEDDING: a model turns a piece of text into a list of ~1,500 numbers
 *   (a "vector"). Texts with similar meaning get vectors that sit close
 *   together, like GPS coordinates for meaning. That is what lets
 *   "fire safety cloth" find "fire blanket" even with different words.
 * - VECTOR STORE / INDEX: a database built to answer "which stored vectors
 *   are closest to this one?" fast. Here that is Upstash Vector (hosted,
 *   because Vercel can't keep files on disk between requests).
 * - UPSERT: "update or insert". If the id already exists it is replaced,
 *   otherwise it is added — so running this twice never creates duplicates.
 *
 * Read in this order: main() at the bottom → loadProducts → loadGuideChunks
 * → embedAndUpsert.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'node:fs/promises';
import path from 'node:path';
import { Index } from '@upstash/vector';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

const PRODUCTS_PATH = path.join(process.cwd(), 'corpus', 'products.jsonl');
const GUIDE_DIR = path.join(process.cwd(), 'corpus', 'guide');
// BATCHING: send 100 texts per API call instead of 1,038 separate calls —
// fewer round trips and less chance of hitting the rate limit.
const BATCH_SIZE = 100;
const MAX_RETRIES = 5;

type ProductRecord = {
  id: string;
  code: string;
  text: string;
  [key: string]: unknown;
};

type GuideChunk = {
  id: string;
  text: string;
  doc_type: 'guide';
  title: string;
  heading: string;
};

function parseLimitArg(): number | undefined {
  const idx = process.argv.findIndex((a) => a === '--limit' || a.startsWith('--limit='));
  if (idx === -1) return undefined;
  const arg = process.argv[idx];
  const value = arg.includes('=') ? arg.split('=')[1] : process.argv[idx + 1];
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Products are already one chunk each (built by scripts/build_corpus.py),
 * so this only reads them — one JSON object per line. */
async function loadProducts(limit?: number): Promise<ProductRecord[]> {
  const raw = await fs.readFile(PRODUCTS_PATH, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const selected = limit ? lines.slice(0, limit) : lines;
  return selected.map((l) => JSON.parse(l));
}

function parseFrontmatterTitle(md: string): { title: string; body: string } {
  const match = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { title: '', body: md };
  const [, frontmatter, body] = match;
  const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
  return { title: titleMatch ? titleMatch[1].trim() : '', body };
}

/** Split a guide doc's body into ## sections. Intro text before the first
 * heading (the # title and lead-in paragraph) is folded into the first
 * section so nothing is dropped.
 *
 * CHUNKING: a whole document squeezed into one vector blurs every topic in it
 * together, so it matches no specific question well. One section per chunk
 * keeps each vector about one idea. Headings are a natural boundary because
 * the author already grouped related sentences under them. */
function splitByHeading(body: string): { heading: string; text: string }[] {
  const parts = body.trim().split(/\n(?=## )/);
  const sections: { heading: string; text: string }[] = [];
  let intro = '';
  for (const part of parts) {
    const headingMatch = part.match(/^##\s+(.+)$/m);
    if (!headingMatch) {
      intro = part.trim();
      continue;
    }
    const text = intro ? `${intro}\n\n${part.trim()}` : part.trim();
    sections.push({ heading: headingMatch[1].trim(), text });
    intro = '';
  }
  return sections;
}

async function loadGuideChunks(): Promise<GuideChunk[]> {
  const files = (await fs.readdir(GUIDE_DIR)).filter((f) => f.endsWith('.md')).sort();
  const chunks: GuideChunk[] = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(GUIDE_DIR, file), 'utf-8');
    const { title, body } = parseFrontmatterTitle(raw);
    const sections = splitByHeading(body);
    sections.forEach((section, i) => {
      // Deterministic id: same file + same section number = same id every
      // run, which is what makes upsert overwrite instead of duplicate.
      // doc_type: 'guide' lets retrieval tell guides apart from products.
      chunks.push({
        id: `guide::${file}::${i}`,
        text: section.text,
        doc_type: 'guide',
        title,
        heading: section.heading,
      });
    });
  }
  return chunks;
}

function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('429') || message.toLowerCase().includes('rate limit');
}

/** EXPONENTIAL BACKOFF: on a rate-limit error (HTTP 429, "slow down"), wait
 * 2s, then 4s, 8s, 16s, 32s before retrying. Any other error fails at once. */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > MAX_RETRIES || !isRateLimitError(err)) throw err;
      const delayMs = 2 ** attempt * 1000;
      console.warn(`  ${label} hit a rate limit, retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})…`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function embedAndUpsert(
  index: Index,
  ids: string[],
  texts: string[],
  metadataFor: (i: number) => Record<string, unknown>,
  label: string,
) {
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchIds = ids.slice(i, i + BATCH_SIZE);
    const batchTexts = texts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(ids.length / BATCH_SIZE);
    console.log(`  ${label} batch ${batchNum}/${totalBatches} (${batchIds.length} records)…`);

    // 1. EMBED: send up to 100 texts, get back one vector per text, same order.
    //    The model name matters: retrieval.ts must embed questions with the
    //    SAME model, or question and product vectors live in different spaces.
    const { embeddings } = await withRetry(
      () => embedMany({ model: openai.embedding('text-embedding-3-small'), values: batchTexts }),
      `${label} embed batch ${batchNum}`,
    );

    // 2. PACKAGE: each stored entry = id + vector + metadata. The vector is
    //    for finding; the metadata (text, name, price_php, ...) is what we
    //    read back and show once it has been found.
    const vectors = batchIds.map((id, j) => ({
      id,
      vector: embeddings[j],
      metadata: { text: batchTexts[j], ...metadataFor(i + j) },
    }));

    // 3. STORE: write the batch into Upstash Vector.
    await withRetry(() => index.upsert(vectors), `${label} upsert batch ${batchNum}`);
  }
}

async function main() {
  if (!process.env.UPSTASH_VECTOR_REST_URL || !process.env.UPSTASH_VECTOR_REST_TOKEN) {
    console.error('Missing UPSTASH_VECTOR_REST_URL / UPSTASH_VECTOR_REST_TOKEN. Set them in .env.local.');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY in .env.local.');
    process.exit(1);
  }

  const limit = parseLimitArg();
  // Reads UPSTASH_VECTOR_REST_URL / _TOKEN from the environment to connect.
  const index = new Index();

  console.log(`Reading products from ${PRODUCTS_PATH}${limit ? ` (limit ${limit})` : ''}…`);
  const products = await loadProducts(limit);
  console.log(`  loaded ${products.length} product record(s)`);

  console.log(`Reading guide docs from ${GUIDE_DIR}…`);
  const guideChunks = await loadGuideChunks();
  console.log(`  loaded ${guideChunks.length} guide chunk(s)`);

  // Products and guides go into the SAME index; metadata.doc_type is how
  // retrieval tells them apart later.
  await embedAndUpsert(
    index,
    products.map((p) => p.id),
    products.map((p) => p.text),
    (i) => {
      // Every field except text (which embedAndUpsert adds back itself).
      const { text, ...metadata } = products[i];
      return metadata;
    },
    'products',
  );

  await embedAndUpsert(
    index,
    guideChunks.map((c) => c.id),
    guideChunks.map((c) => c.text),
    (i) => {
      const { text, ...metadata } = guideChunks[i];
      return metadata;
    },
    'guide',
  );

  const info = await index.info();
  console.log(`Done. Index now holds ${info.vectorCount} vector(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
