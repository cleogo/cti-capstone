/**
 * What the customer sees, built from tool data only (spec
 * docs/superpowers/specs/2026-11-06-product-list-ui-design.md).
 *
 * Client-safe: types, formatting, displayedAnswer and pickChips. It must not
 * import the catalog. showProducts, which reads the catalog, is in
 * lib/show-products.ts (server only).
 */

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

export function formatPeso(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type RecordLike = { code: string; name: string; category?: string; price_php: number | null; colors?: string[]; page?: number; data_quality_flag?: string };

/**
 * A getProductDetails result as one product card. A conflict code has two
 * records: it becomes one card with no price.
 */
export function shownFromDetails(result: unknown): ShowProductsResult {
  const records = ((result as { products?: RecordLike[] } | null)?.products ?? []).filter((p) => p && typeof p.code === 'string');
  if (records.length === 0) return { products: [], unknown: [] };
  const p = records[0];
  const conflict = records.some((r) => r.data_quality_flag === 'duplicate_code_conflict');
  return {
    products: [{ code: p.code, name: p.name, category: p.category, price_php: conflict ? null : p.price_php, colors: p.colors, page: p.page, data_quality_flag: conflict ? 'duplicate_code_conflict' : p.data_quality_flag }],
    unknown: [],
  };
}

/** The products a tool result puts on screen as cards: showProducts, a details card, or the compare card. */
function shownBy(name: string, result: unknown): ShownProduct[] {
  if (name === 'showProducts' || name === 'compareProducts') return ((result as { products?: ShownProduct[] } | null)?.products ?? []);
  if (name === 'getProductDetails') return shownFromDetails(result).products;
  return [];
}

/**
 * The answer as the customer sees it: the text plus one plain line for each
 * product that a card put on screen. The eval harnesses score this, not the
 * bare text, because V4 keeps prices out of the text.
 */
export function displayedAnswer(text: string, results: { name: string; result: unknown }[]): string {
  const lines: string[] = [];
  const lists = new Set<string>();
  for (const r of results) {
    if (r.name === 'showProducts') {
      const key = listKey(r.result);
      if (lists.has(key)) continue;
      lists.add(key);
    }
    for (const p of shownBy(r.name, r.result)) {
      const price = p.price_php === null ? 'price to be confirmed by sales' : formatPeso(p.price_php);
      lines.push(`${p.code} · ${p.name} · ${price}`);
    }
  }
  return lines.length ? `${text}\n${lines.join('\n')}` : text;
}

export type Chip = { label: string; prompt: string };

/** Routes to showApplianceChecklist: a power-station request that names no appliances. */
const PICK_APPLIANCES: Chip = { label: 'Use my appliances', prompt: 'I want to pick my own appliances for a power station.' };

/**
 * Follow-up chips for the latest answer (spec 6.2), at most 3. A quotation
 * wins over a recommendation, which wins over a product list.
 */
export function pickChips(invocations: { toolName: string; result: unknown }[]): Chip[] {
  const last = (name: string) => [...invocations].reverse().find((i) => i.toolName === name)?.result;
  const quote = (code: string): Chip => ({ label: 'Add to a quote', prompt: `Add ${code} to my quote.` });

  if (last('buildQuotation')) {
    return [
      { label: 'Add another item', prompt: 'I want to add another item to my quote.' },
      { label: 'Talk to sales', prompt: 'Refer me to CTI sales about my quotation.' },
    ];
  }

  const rec = last('recommendPowerStation') as { eligible?: { code: string }[] } | undefined;
  if (rec?.eligible?.length) {
    const [a, b] = rec.eligible;
    const chips: Chip[] = [{ label: 'Quote the smallest fit', prompt: `Add ${a.code} to my quote.` }];
    if (b) chips.push({ label: 'Compare both', prompt: `Compare ${a.code} and ${b.code}.` });
    return chips;
  }
  if (rec && !rec.eligible?.length) {
    const runtime = (rec as { runtime?: { code: string }[] }).runtime ?? [];
    if (runtime.length) return [{ label: 'Quote the longest runtime', prompt: `Add ${runtime[0].code} to my quote.` }, PICK_APPLIANCES];
  }

  const compared = last('compareProducts') as { sample_day?: unknown } | undefined;
  if (compared?.sample_day) return [PICK_APPLIANCES];

  const products = (last('showProducts') as Partial<ShowProductsResult> | undefined)?.products ?? [];
  if (products.length === 1) {
    const [p] = products;
    const chips: Chip[] = [{ label: 'Show specs', prompt: `What are the specs of ${p.code}?` }];
    if (p.price_php !== null) chips.push(quote(p.code));
    return chips;
  }
  if (products.length >= 2) {
    const [a, b] = products;
    const chips: Chip[] = [
      { label: 'Compare the first two', prompt: `Compare ${a.code} and ${b.code}.` },
      { label: 'Show cheaper options', prompt: 'Show cheaper options than these.' },
    ];
    if (a.price_php !== null) chips.push({ label: 'Quote the first one', prompt: `Add ${a.code} to my quote.` });
    return chips;
  }
  return [];
}

/** True when the answer shows at least one product card (showProducts or a details card). */
export function listsProducts(invocations: { toolName: string; result: unknown }[]): boolean {
  return invocations.some((i) => (i.toolName === 'showProducts' || i.toolName === 'getProductDetails') && shownBy(i.toolName, i.result).length > 0);
}

const listKey = (result: unknown) => ((result as { products?: ShownProduct[] } | null)?.products ?? []).map((p) => p.code).join(',');

/**
 * The toolCallIds of showProducts results that repeat an earlier list in the
 * same answer, code for code, or whose codes a recommendPowerStation or
 * compareProducts card in the answer already shows. The UI skips them. The
 * model sometimes calls showProducts twice, or after a sizing card.
 */
export function repeatedLists(invocations: { toolCallId: string; toolName: string; state?: string; result?: unknown }[]): Set<string> {
  const seen = new Set<string>();
  const skip = new Set<string>();
  // Codes that a sizing or compare card in this answer already shows.
  const carded = new Set<string>();
  for (const i of invocations) {
    if (i.state !== 'result') continue;
    const r = i.result as { eligible?: { code: string }[]; runtime?: { code: string }[]; products?: { code: string }[] } | null;
    if (i.toolName === 'recommendPowerStation') for (const x of [...(r?.eligible ?? []), ...(r?.runtime ?? [])]) carded.add(x.code);
    if (i.toolName === 'compareProducts') for (const x of r?.products ?? []) carded.add(x.code);
  }
  for (const i of invocations) {
    if (i.toolName !== 'showProducts' || i.state !== 'result') continue;
    const key = listKey(i.result);
    const codes = key ? key.split(',') : [];
    if ((key && seen.has(key)) || (codes.length > 0 && codes.every((c) => carded.has(c)))) skip.add(i.toolCallId);
    seen.add(key);
  }
  return skip;
}
