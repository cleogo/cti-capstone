/**
 * Next.js calls register() once per server start. It sends the AI SDK's
 * OpenTelemetry spans to Langfuse (see lib/telemetry.ts).
 */
import { registerOTel } from '@vercel/otel';

export async function register() {
  // The Langfuse processor needs Node APIs. Every route here runs on Node.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { langfuseProcessor } = await import('./lib/telemetry');
  registerOTel({ serviceName: 'cti-capstone', spanProcessors: [langfuseProcessor()] });
}
