/**
 * showProducts turns the codes the model picked into masterlist records. The
 * UI renders prices from these records, never from model text. Server only:
 * it reads the catalog, so the client must not import this file.
 */
import { BY_CODE } from '@/lib/products';
import type { ShowProductsResult, ShownProduct } from '@/lib/display';

export const MAX_SHOWN = 50;

export function showProducts(codes: string[]): ShowProductsResult {
  const products: ShownProduct[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    const records = BY_CODE.get(code);
    if (!records?.length) {
      unknown.push(code);
      continue;
    }
    if (products.length >= MAX_SHOWN) continue;
    const p = records[0];
    const conflict = records.some((r) => r.data_quality_flag === 'duplicate_code_conflict');
    products.push({
      code: p.code,
      name: p.name,
      category: p.category,
      price_php: conflict ? null : p.price_php,
      colors: p.colors,
      page: p.page,
      data_quality_flag: conflict ? 'duplicate_code_conflict' : p.data_quality_flag,
    });
  }
  return { products, unknown };
}

