/**
 * Checks that the token counts in eval/out/rag-<variant>.jsonl match what Langfuse holds
 * for the same trace. Langfuse splits input into `input` and `input_cached_tokens`: the sum is the prompt tokens. Samples 3 traces. Run: npx tsx scripts/eval-langfuse.ts --variant v1
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { readFileSync } from 'node:fs';
const rows = readFileSync(`eval/out/rag-${process.argv[process.argv.indexOf('--variant') + 1] ?? 'v1'}.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const base = process.env.LANGFUSE_BASE_URL!.replace(/\/$/, '');
const auth = 'Basic ' + Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString('base64');
async function main() {
  for (const id of ['spec-01', 'price-05', 'compare-04']) {
    const r = rows.find((x) => x.id === id);
    const traceId = r.trace.split('/trace/')[1];
    const res = await fetch(`${base}/api/public/v2/observations?traceId=${traceId}&limit=100&fields=core,basic,usage`, { headers: { Authorization: auth } });
    const j: any = await res.json();
    const obs = j.data ?? [];
    const gens = obs.filter((o: any) => o.type === 'GENERATION');
    const inTok = gens.reduce((a: number, o: any) => a + ((o.usageDetails?.input ?? 0) + (o.usageDetails?.input_cached_tokens ?? 0)), 0);
    const outTok = gens.reduce((a: number, o: any) => a + (o.usageDetails?.output ?? o.completionTokens ?? 0), 0);
    if (process.argv.includes('--debug')) console.log(JSON.stringify(gens.map((o: any) => o.usageDetails)));
    console.log(id, 'http', res.status, 'observations', obs.length, 'generations', gens.length, 'langfuse in/out', inTok, outTok, '| record in/out', r.tokens_in, r.tokens_out, inTok === r.tokens_in && outTok === r.tokens_out ? 'MATCH' : 'DIFFERENT');
  }
}
main();
