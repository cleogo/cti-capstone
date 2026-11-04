/**
 * Product details and comparison, by exact code.
 *
 * Prices always come from the masterlist record (BY_CODE). Specs only come
 * from a knowledge sheet. An item with no sheet is "not on file" — never a
 * gap for the model to fill. A code flagged duplicate_code_conflict has two
 * records that disagree on price, so details returns both and compare shows
 * no price at all.
 */
import { BY_CODE, type Product } from '@/lib/products';
import { sheetForCode, type Sheet } from '@/lib/sheets';

export type DetailsResult = {
  status: 'on_file' | 'not_on_file' | 'unknown_code';
  products: Product[];
  sheet: Sheet | null;
};

export type CompareResult = {
  products: {
    code: string;
    name: string;
    price_php: number | null;
    data_quality_flag?: string;
    sheet_slug: string | null;
    source_url: string | null;
  }[];
  /** A null value means "not on file" for that product. */
  rows: { label: string; values: (string | null)[] }[];
};

const CONFLICT = 'duplicate_code_conflict';

export function getProductDetails(code: string): DetailsResult {
  const products = BY_CODE.get(code.trim().toUpperCase()) ?? [];
  if (products.length === 0) return { status: 'unknown_code', products, sheet: null };
  const sheet = sheetForCode(code);
  return { status: sheet ? 'on_file' : 'not_on_file', products, sheet };
}

export function compareProducts(codes: string[]): CompareResult {
  if (codes.length < 2 || codes.length > 4) {
    throw new Error(`compareProducts takes 2 to 4 codes, got ${codes.length}`);
  }
  const details = codes.map((c) => {
    const d = getProductDetails(c);
    if (d.status === 'unknown_code') throw new Error(`unknown product code ${c}`);
    return d;
  });

  const products = details.map((d) => {
    const p = d.products[0];
    const conflict = d.products.some((r) => r.data_quality_flag === CONFLICT);
    return {
      code: p.code,
      name: p.name,
      price_php: conflict ? null : p.price_php,
      ...(conflict ? { data_quality_flag: CONFLICT } : {}),
      sheet_slug: d.sheet?.slug ?? null,
      source_url: d.sheet?.sources[0] ?? null,
    };
  });

  // Labels in first-seen order across the sheets, so rows read like a sheet.
  const labels: string[] = [];
  for (const d of details) for (const s of d.sheet?.specs ?? []) if (!labels.includes(s.label)) labels.push(s.label);
  const rows = labels.map((label) => ({
    label,
    values: details.map((d) => d.sheet?.specs.find((s) => s.label === label)?.value ?? null),
  }));

  return { products, rows };
}
