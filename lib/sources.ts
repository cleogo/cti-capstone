/**
 * Turns one assistant message's tool results into the source list the UI
 * renders — both the per-message inline sources and the desktop panel's
 * mirror of the latest turn use this, so the two can't silently diverge.
 *
 * `useChat` result payloads cross the wire as `any` (they were `JSONValue` on
 * the stream), so this is written against the runtime shape rather than the
 * server-side types in lib/retrieval.ts: an array is a searchProducts result
 * (products and/or guide sections mixed together), an object with `items` is
 * a filterProducts result.
 */
import type { Message } from 'ai';

export type ProductSource = {
  kind: 'product';
  code: string;
  name: string;
  category?: string;
  price_php: number;
  colors?: string[];
  data_quality_flag?: string;
  /** Page in the printed price list this product appears on. */
  page?: number;
};

export type GuideSource = {
  kind: 'guide';
  title: string;
  heading: string;
};

export type SheetSource = {
  kind: 'sheet';
  slug: string;
  /** The sheet's first source: the manufacturer page or manual it cites. */
  url: string;
};

export type Source = ProductSource | GuideSource | SheetSource;

function isProductLike(v: unknown): v is Record<string, unknown> {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as Record<string, unknown>).code === 'string' &&
    typeof (v as Record<string, unknown>).price_php === 'number'
  );
}

function isGuideLike(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && (v as Record<string, unknown>).doc_type === 'guide';
}

function toSheet(slug: unknown, url: unknown): SheetSource | null {
  return typeof slug === 'string' && slug && typeof url === 'string' && url
    ? { kind: 'sheet', slug, url }
    : null;
}

function toProduct(v: Record<string, unknown>): ProductSource {
  return {
    kind: 'product',
    code: String(v.code),
    name: String(v.name ?? ''),
    category: typeof v.category === 'string' ? v.category : undefined,
    price_php: Number(v.price_php),
    colors: Array.isArray(v.colors) ? (v.colors as string[]) : undefined,
    data_quality_flag: typeof v.data_quality_flag === 'string' ? v.data_quality_flag : undefined,
    page: typeof v.page === 'number' ? v.page : undefined,
  };
}

function toGuide(v: Record<string, unknown>): GuideSource {
  return {
    kind: 'guide',
    title: String(v.title ?? ''),
    heading: String(v.heading ?? ''),
  };
}

/**
 * Products dedupe by code — a variant-family fill-in and an exact-match hit
 * can name the same product twice within one searchProducts call. Guide
 * sections dedupe by title+heading for the same reason. Order is call order,
 * which is retrieval-ranked order for products.
 */
export function sourcesFromMessage(message: Message): Source[] {
  const products = new Map<string, ProductSource>();
  const guides = new Map<string, GuideSource>();
  const sheets = new Map<string, SheetSource>();
  const addSheet = (sh: SheetSource | null) => {
    if (sh && !sheets.has(sh.slug)) sheets.set(sh.slug, sh);
  };

  for (const inv of message.toolInvocations ?? []) {
    // showProducts is what the answer displays, not retrieval evidence.
    if (inv.state !== 'result' || inv.toolName === 'showProducts') continue;
    const result = inv.result as unknown;
    const obj = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;

    // searchProducts: an array. filterProducts: { items }. getProductDetails
    // and compareProducts: { products }, with the sheet on the result
    // (details) or on each product (compare).
    const rows: unknown[] = Array.isArray(result)
      ? result
      : Array.isArray(obj.items)
        ? obj.items
        : Array.isArray(obj.products)
          ? obj.products
          : [];

    const sheet = obj.sheet as { slug?: unknown; sources?: unknown[] } | null | undefined;
    if (sheet) addSheet(toSheet(sheet.slug, sheet.sources?.[0]));

    for (const row of rows) {
      const r = (row ?? {}) as Record<string, unknown>;
      if (r.doc_type === 'sheet') addSheet(toSheet(r.slug, r.source_url));
      else if ('sheet_slug' in r) addSheet(toSheet(r.sheet_slug, r.source_url));

      if (isProductLike(row)) {
        const p = toProduct(row);
        if (!products.has(p.code)) products.set(p.code, p);
      } else if (isGuideLike(row)) {
        const g = toGuide(row);
        const key = `${g.title}::${g.heading}`;
        if (!guides.has(key)) guides.set(key, g);
      }
    }
  }

  return [...products.values(), ...sheets.values(), ...guides.values()];
}
