/**
 * Langfuse tracing, in one place.
 *
 * The AI SDK emits OpenTelemetry spans for every generateText / streamText
 * call that passes `experimental_telemetry`. LangfuseSpanProcessor sends
 * those spans to Langfuse's OTel endpoint: one trace per call, with each
 * tool call and model step inside it. It reads LANGFUSE_PUBLIC_KEY,
 * LANGFUSE_SECRET_KEY and LANGFUSE_BASE_URL from the environment.
 *
 * Two places register the processor:
 *   - the Next.js app: instrumentation.ts, through @vercel/otel
 *   - scripts: scripts/tracing.ts, through NodeSDK, which must be shut down
 *     before the process exits or the last batch of spans is lost
 *
 * Surprise, 3 Nov: langfuse-vercel (the plan's choice) uses the legacy
 * ingestion API. New Langfuse orgs reject it with "Event type not accepted".
 */
import { LangfuseSpanProcessor, isDefaultExportSpan } from '@langfuse/otel';

/** The value for `experimental_telemetry`. functionId names the trace. */
export function telemetry(functionId: string, metadata?: Record<string, string>) {
  return { isEnabled: true, functionId, metadata };
}

/**
 * Our own spans use a tracer whose name starts with "cti" (the M7 request
 * span in the chat route, the eval spans). By default the processor exports
 * only LLM spans, so a request that the input guard blocks before any model
 * call would have no trace. The filter adds the "cti" spans.
 */
export function langfuseProcessor() {
  return new LangfuseSpanProcessor({
    shouldExportSpan: ({ otelSpan }) => isDefaultExportSpan(otelSpan) || otelSpan.instrumentationScope.name.startsWith('cti'),
  });
}
