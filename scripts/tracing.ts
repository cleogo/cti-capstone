/**
 * Tracing for scripts. Call startTracing() after dotenv has loaded, and
 * `await sdk.shutdown()` before process.exit. Shutdown flushes the spans
 * still in the batch. Without it, the trace never reaches Langfuse.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { langfuseProcessor } from '../lib/telemetry';

export function startTracing(): NodeSDK {
  const sdk = new NodeSDK({ serviceName: 'cti-capstone-scripts', spanProcessors: [langfuseProcessor()] });
  sdk.start();
  return sdk;
}
