/**
 * CATALOG_VERSION (PRD §12): the first 12 hex characters of the sha256 of the
 * product records plus the knowledge sheets. It goes into every response-cache
 * key, so a corpus rebuild changes the key and old answers miss.
 *
 * The hash covers the imported JSON, so it is the same on Vercel, in Docker
 * and in a script. No file read at runtime.
 */
import { createHash } from 'node:crypto';
import { RECORDS } from './products';
import { SHEETS } from './sheets';

export const CATALOG_VERSION = createHash('sha256')
  .update(JSON.stringify(RECORDS))
  .update(JSON.stringify(SHEETS))
  .digest('hex')
  .slice(0, 12);

/**
 * The seed script's per-chunk hash. A chunk whose text and metadata are
 * unchanged is not embedded or upserted again.
 */
export function contentHash(text: string, metadata: Record<string, unknown>): string {
  return createHash('sha256').update(text).update('\u0000').update(JSON.stringify(metadata)).digest('hex').slice(0, 16);
}
