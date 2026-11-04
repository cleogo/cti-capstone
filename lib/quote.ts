/**
 * Draft quotations (PRD F5). Code computes every figure. The model only
 * chooses the lines and refers the client to the card.
 *
 * Money is integer centavos inside this module and pesos (2 decimals) at the
 * boundary. Prices are VAT-inclusive, so VAT is worked backwards:
 * VATable = round(total / 1.12), VAT = total - VATable. VAT absorbs the
 * rounding, so the two lines always add up to the total exactly.
 */
import { z } from 'zod';
import { BY_CODE } from '@/lib/products';

export const MAX_QTY = 9999;
export const MAX_LINES = 30;
/** Bulk thresholds, approved by the user on 4 Nov (docs/plan.md, M4). */
export const BULK_LINE_QTY = 50;
export const BULK_TOTAL_PHP = 500_000;

export const NOTE =
  'Draft quotation: prices from the CTI masterlist, subject to confirmation by CTI sales. Not an order. All prices VAT-inclusive.';

const peso = z.number().nonnegative().multipleOf(0.01);

export const QuotationSchema = z.object({
  ref: z.string().regex(/^CTI-Q-\d{8}-[0-9A-Z]{4}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z
    .array(
      z.object({
        code: z.string(),
        name: z.string().min(1),
        qty: z.number().int().min(1).max(MAX_QTY),
        unit_price_php: z.number().int().positive(),
        line_total_php: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(MAX_LINES),
  total_php: peso,
  vatable_sales_php: peso,
  vat_php: peso,
  note: z.literal(NOTE),
});

export type Quotation = z.infer<typeof QuotationSchema>;

export type QuoteError = {
  code: string;
  reason: 'unknown_code' | 'conflict_code' | 'bad_qty' | 'too_many_lines';
};

export type QuoteResult =
  | { ok: true; quote: Quotation; bulk: { line_over_50: boolean; total_over_500k: boolean } }
  | { ok: false; errors: QuoteError[] };

const validQty = (q: number) => Number.isInteger(q) && q >= 1 && q <= MAX_QTY;

/** Calendar date in Manila (UTC+8, no DST), as YYYY-MM-DD. */
function manilaDate(d: Date, plusDays = 0): string {
  return new Date(d.getTime() + 8 * 3600_000 + plusDays * 86400_000).toISOString().slice(0, 10);
}

function randomSuffix(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function buildQuotation(items: { code: string; qty: number }[], now: Date = new Date()): QuoteResult {
  const errors: QuoteError[] = [];

  // Merge repeated codes first: the same code twice is one line.
  const merged = new Map<string, number>();
  for (const { code, qty } of items) {
    const key = code.trim().toUpperCase();
    if (!validQty(qty)) {
      errors.push({ code: key, reason: 'bad_qty' });
      continue;
    }
    merged.set(key, (merged.get(key) ?? 0) + qty);
  }

  if (merged.size > MAX_LINES) return { ok: false, errors: [{ code: '', reason: 'too_many_lines' }] };

  const lines: Quotation['lines'] = [];
  for (const [code, qty] of merged) {
    const records = BY_CODE.get(code);
    if (!records) {
      errors.push({ code, reason: 'unknown_code' });
    } else if (records.length > 1 || records[0].data_quality_flag === 'duplicate_code_conflict') {
      errors.push({ code, reason: 'conflict_code' });
    } else if (qty > MAX_QTY) {
      errors.push({ code, reason: 'bad_qty' });
    } else {
      const p = records[0];
      lines.push({ code: p.code, name: p.name, qty, unit_price_php: p.price_php, line_total_php: p.price_php * qty });
    }
  }
  if (errors.length > 0 || lines.length === 0) {
    return { ok: false, errors: errors.length > 0 ? errors : [{ code: '', reason: 'bad_qty' }] };
  }

  const totalC = lines.reduce((s, l) => s + l.line_total_php, 0) * 100;
  const vatableC = Math.round(totalC / 1.12);
  const vatC = totalC - vatableC;

  const quote = QuotationSchema.parse({
    ref: `CTI-Q-${manilaDate(now).replace(/-/g, '')}-${randomSuffix()}`,
    date: manilaDate(now),
    valid_until: manilaDate(now, 30),
    lines,
    total_php: totalC / 100,
    vatable_sales_php: vatableC / 100,
    vat_php: vatC / 100,
    note: NOTE,
  });

  return {
    ok: true,
    quote,
    bulk: {
      line_over_50: lines.some((l) => l.qty > BULK_LINE_QTY),
      total_over_500k: totalC > BULK_TOTAL_PHP * 100,
    },
  };
}
