/**
 * What the customer sees, built from tool data only (spec
 * docs/superpowers/specs/2026-11-06-product-list-ui-design.md).
 *
 * showProducts turns the codes the model picked into masterlist records. The
 * UI renders prices from these records, never from model text.
 */
import { BY_CODE } from '@/lib/products';

export type ShownProduct = {
  code: string;
  name: string;
  category?: string;
  /** null for a duplicate_code_conflict code: sales must confirm the price. */
  price_php: number | null;
  colors?: string[];
  page?: number;
  data_quality_flag?: string;
};

export type ShowProductsResult = { products: ShownProduct[]; unknown: string[] };

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

export function formatPeso(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The answer as the customer sees it: the text plus one plain line for each
 * product that showProducts put on screen. The eval harnesses score this, not
 * the bare text, because V4 keeps prices out of the text.
 */
export function displayedAnswer(text: string, results: { name: string; result: unknown }[]): string {
  const lines: string[] = [];
  for (const r of results) {
    if (r.name !== 'showProducts') continue;
    const products = (r.result as Partial<ShowProductsResult> | null)?.products ?? [];
    for (const p of products) {
      const price = p.price_php === null ? 'price to be confirmed by sales' : formatPeso(p.price_php);
      lines.push(`${p.code} · ${p.name} · ${price}`);
    }
  }
  return lines.length ? `${text}\n${lines.join('\n')}` : text;
}
