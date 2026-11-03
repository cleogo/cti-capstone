/**
 * Smoke test for Langfuse tracing. Asks one question through the production
 * prompt and tools, flushes the trace, and prints its Langfuse URL.
 *
 * Run:
 *   npm run trace:check
 *   npm run trace:check -- "What's the cheapest safety shoe you sell?"
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { trace } from '@opentelemetry/api';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { SYSTEM_PROMPT } from '../lib/prompt';
import { tools } from '../lib/tools';
import { CHAT_MODEL } from '../lib/model';
import { telemetry } from '../lib/telemetry';
import { startTracing } from './tracing';

async function main() {
  for (const name of ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL']) {
    if (!process.env[name]) throw new Error(`Missing ${name} in .env.local.`);
  }

  const sdk = startTracing();
  const question = process.argv[2] ?? 'How many fire extinguishers under ₱2,000 do you carry?';
  let traceId = '';

  try {
    // A parent span fixes the OTel trace id, which is the Langfuse trace id.
    // Langfuse drops this span (not an AI span) but keeps the trace id.
    const res = await trace.getTracer('trace-check').startActiveSpan('trace-check', async (span) => {
      traceId = span.spanContext().traceId;
      try {
        return await generateText({
          model: openai(CHAT_MODEL),
          system: SYSTEM_PROMPT,
          prompt: question,
          tools,
          maxSteps: 5,
          experimental_telemetry: telemetry('trace-check'),
        });
      } finally {
        span.end();
      }
    });
    const calls = res.steps.flatMap((s) => (s.toolCalls ?? []).map((c) => c.toolName));
    console.log(`Q: ${question}`);
    console.log(`Tool calls: ${calls.join(', ') || '(none)'}`);
    console.log(`A: ${res.text.slice(0, 300)}${res.text.length > 300 ? '…' : ''}`);
  } finally {
    await sdk.shutdown();
  }

  console.log(`\nTrace: ${process.env.LANGFUSE_BASE_URL!.replace(/\/$/, '')}/trace/${traceId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
