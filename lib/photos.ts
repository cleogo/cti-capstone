/**
 * Product photo lookup (docs/ui-design-decisions.md D5). A photo is for reference only. The
 * card text (name, code, price_php) stays the source of truth.
 *
 * Rule: a duplicate_code_conflict item never gets a photo. Its sheet row can show the wrong
 * variant.
 */
import manifest from '@/data/product-images.json';

const PRODUCTS = manifest.products as Record<string, string>;

export const CATEGORY_TILES: { label: string; category: string; img: string }[] = manifest.categories;

export function photoFor(code: string, dataQualityFlag?: string): string | undefined {
  if (dataQualityFlag === 'duplicate_code_conflict') return undefined;
  return PRODUCTS[code.trim().toUpperCase()];
}
