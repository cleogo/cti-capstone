/**
 * Cache bench (PRD §12, M8): 20 repeated questions and 20 paraphrases, with the
 * response caches on and off. It prints p50, p95 and an estimated cost.
 *
 * It calls a running server over HTTP, so it measures the route as shipped:
 * rate limit, input guard, caches, answer guard. Start the server like this:
 *
 *   ALLOW_BENCH_HEADERS=1 RATE_LIMIT_PER_MIN=1000 TICKET_KEY_PREFIX=bench: npx next dev -p 3200
 *   npx tsx scripts/cache-bench.ts --url http://localhost:3200 --flush
 *
 * --flush empties both response caches first (see flush()).
 *
 * ALLOW_BENCH_HEADERS lets the request header x-bench-no-cache: 1 skip both
 * response caches (the "cache off" passes). RATE_LIMIT_PER_MIN lifts the 15 a
 * minute limit for the run. TICKET_KEY_PREFIX keeps the tickets that the
 * questions create out of the staff list.
 *
 * Passes, in order:
 *   on-cold         the 20 base questions, caches on
 *   on-repeat       the same 20 again, caches on         (a)
 *   on-paraphrase   20 rewordings of them, caches on     (b)
 *   off-repeat      the same 20, caches off              (a)
 *   off-paraphrase  the 20 rewordings, caches off        (b)
 * A pass is cold only on the first run in 24 hours. A second run finds the
 * entries from the first and on-cold shows hits too. The x-cache header of
 * each response says which.
 *
 * Both modes use the Redis query-embedding cache and the same input guard. The
 * "off" passes switch off the exact cache and the semantic cache only.
 *
 * Cost is an estimate from the chat model's token usage in the stream. It does
 * not count the input guard, moderation, rewrite or embedding calls, which are
 * the same in both modes except that a cache hit skips the chat call.
 */
import fs from 'node:fs';

const BASE: string[] = [
  'What can you help me with?',
  'Do you deliver to Cebu?',
  'Can I pay by credit card?',
  'What are your business hours?',
  'Do you install the products you sell?',
  'Who are you?',
  'Can the public buy from CTI or only companies?',
  'Do you offer a warranty on your products?',
  'How much is MED-001-01?',
  'What are the specs of PWR-001-06?',
  'What is a heat alarm used for?',
  'What is the cheapest fire extinguisher?',
  'Show me stethoscopes',
  'How much is the trash bin?',
  'Compare PWR-001-06 and PWR-001-05',
  'What is a class K extinguisher used for?',
  'Do you have fire blankets?',
  'What is the price of FIR-001-10LBS?',
  'What is a spine board used for?',
  'List helmets under 1000 pesos',
];

const PARAPHRASE: string[] = [
  'What kind of things can you assist me with?',
  'Do you ship orders to Cebu?',
  'Do you accept credit cards for payment?',
  'What time are you open?',
  'Do you also install what you sell?',
  'Who am I talking to?',
  'Do you sell to individuals or only to businesses?',
  'Is there a warranty on the products you sell?',
  'What does MED-001-01 cost?',
  'Give me the specifications of PWR-001-06.',
  'What are heat alarms for?',
  'Which fire extinguisher is the cheapest?',
  'I am looking for a stethoscope',
  'What is the price of the trash bin?',
  'PWR-001-06 versus PWR-001-05, what is the difference?',
  'What is class K extinguisher good for?',
  'Are fire blankets sold here?',
  'FIR-001-10LBS price please',
  'What is a spine board for?',
  'Which helmets cost less than 1000 pesos?',
];

// gpt-4o-mini list price per million tokens. An assumption: check it against the current price list.
const PRICE_IN = 0.15;
const PRICE_OUT = 0.6;

type Sample = { question: string; ms: number; ttfbMs: number; cache: string; tokensIn: number; tokensOut: number; status: number };
type Pass = { name: string; samples: Sample[] };

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const URL_BASE = arg('url', 'http://localhost:3200');
const OUT = arg('out', 'eval/out/cache-bench.json');

async function ask(question: string, bypass: boolean): Promise<Sample> {
  const t0 = performance.now();
  const res = await fetch(`${URL_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(bypass ? { 'x-bench-no-cache': '1' } : {}) },
    body: JSON.stringify({ messages: [{ id: crypto.randomUUID(), role: 'user', content: question }] }),
  });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let ttfbMs = 0;
  let body = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!ttfbMs) ttfbMs = performance.now() - t0;
    body += dec.decode(value, { stream: true });
  }
  const ms = performance.now() - t0;
  // The finish line is `d:{"finishReason":...,"usage":{"promptTokens":n,"completionTokens":n}}`.
  const fin = body.split('\n').findLast((l) => l.startsWith('d:'));
  const usage = fin ? (JSON.parse(fin.slice(2)).usage ?? {}) : {};
  return {
    question,
    ms,
    ttfbMs,
    cache: res.headers.get('x-cache') ?? 'none',
    tokensIn: Number(usage.promptTokens) || 0,
    tokensOut: Number(usage.completionTokens) || 0,
    status: res.status,
  };
}

async function pass(name: string, questions: string[], bypass: boolean): Promise<Pass> {
  console.log(`pass ${name}…`);
  const samples: Sample[] = [];
  for (const q of questions) {
    const s = await ask(q, bypass);
    samples.push(s);
    console.log(`  ${s.cache.padEnd(5)} ${(s.ms / 1000).toFixed(1).padStart(5)} s  ${q}`);
  }
  return { name, samples };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
};

function table(passes: Pass[]): string {
  const rows = passes.map((p) => {
    const ms = p.samples.map((s) => s.ms);
    const ttfb = p.samples.map((s) => s.ttfbMs);
    const hits = p.samples.filter((s) => s.cache === 'hit').length;
    // No x-cache header: the input guard answered with a fixed reply before the cache.
    const guarded = p.samples.filter((s) => s.cache === 'none').length;
    const cost = p.samples.reduce((a, s) => a + (s.tokensIn * PRICE_IN + s.tokensOut * PRICE_OUT) / 1e6, 0);
    const failed = p.samples.filter((s) => s.status !== 200).length;
    return (
      `| ${p.name} | ${hits}/${p.samples.length} | ${guarded} | ${(pct(ms, 0.5) / 1000).toFixed(2)} | ${(pct(ms, 0.95) / 1000).toFixed(2)} | ` +
      `${(pct(ttfb, 0.5) / 1000).toFixed(2)} | $${cost.toFixed(4)}${failed ? ` (${failed} failed)` : ''} |`
    );
  });
  return [
    '| Pass | Cache hits | Input-guard replies | p50 total (s) | p95 total (s) | p50 first byte (s) | Chat-model cost |',
    '|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

/**
 * --flush: delete every exact-cache entry (resp:*) and every semantic-cache
 * entry before the run, so on-cold is cold. The query-embedding cache stays.
 */
async function flush() {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  const { getRedis } = await import('../lib/redis');
  const { Index } = await import('@upstash/vector');
  const redis = getRedis();
  let cursor = '0';
  let n = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { match: 'resp:*', count: 200 });
    if (keys.length > 0) n += await redis.del(...keys);
    cursor = String(next);
  } while (cursor !== '0');
  await new Index().namespace('semantic-cache').reset();
  console.log(`Flushed ${n} exact-cache entries and the semantic-cache namespace.`);
}

async function main() {
  console.log(`Server: ${URL_BASE}`);
  if (process.argv.includes('--flush')) await flush();
  const passes: Pass[] = [];
  passes.push(await pass('on-cold', BASE, false));
  passes.push(await pass('on-repeat', BASE, false));
  passes.push(await pass('on-paraphrase', PARAPHRASE, false));
  passes.push(await pass('off-repeat', BASE, true));
  passes.push(await pass('off-paraphrase', PARAPHRASE, true));

  const md = table(passes);
  console.log(`\n${md}\n`);
  fs.mkdirSync('eval/out', { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), url: URL_BASE, passes }, null, 2));
  fs.writeFileSync(OUT.replace(/\.json$/, '.md'), `${md}\n`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
