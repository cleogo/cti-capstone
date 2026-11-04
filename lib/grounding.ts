/**
 * Grounding check: every figure in an answer must come from a tool result
 * of the same turn, or from the user's own message.
 *
 * Moved out of scripts/grade.ts in M6, so the eval harnesses and the M7
 * answer guard run the same code.
 *
 * "Grounded" is deliberately lenient about WHERE a number sat in a tool
 * result: any number anywhere in the result counts. A figure the model made
 * up almost never equals a number the tools returned by accident, and a
 * strict per-field check would flag correct answers (a price in a quote
 * total, a watt figure in a sheet spec string).
 */

export type Figures = { pesos: number[]; codes: string[]; watts: number[] };

const PESO = /₱\s?(\d[\d,]*(?:\.\d+)?)/g;
const CODE = /\b[A-Z]{3}-\d{3}-[0-9A-Z]+(?:-[0-9A-Z]+)*\b/g;
// "1,800 W" and "60 watts" count. "1,440 Wh" does not: the h is a word character.
const WATT = /(\d[\d,]*(?:\.\d+)?)\s?(?:W|watts?)\b/g;
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ''));
}

export function extractFigures(text: string): Figures {
  const pesos = [...text.matchAll(PESO)].map((m) => toNumber(m[1])).filter(Number.isFinite);
  const codes = [...new Set(text.match(CODE) ?? [])];
  const watts = [...text.matchAll(WATT)].map((m) => toNumber(m[1])).filter(Number.isFinite);
  return { pesos, codes, watts };
}

/** Every number and every string in a tool result, flattened. */
function collect(value: unknown, numbers: Set<number>, strings: string[]): void {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) numbers.add(value);
  } else if (typeof value === 'string') {
    strings.push(value);
    for (const m of value.matchAll(NUMBER)) {
      const n = toNumber(m[0]);
      if (Number.isFinite(n)) numbers.add(n);
    }
  } else if (Array.isArray(value)) {
    for (const v of value) collect(v, numbers, strings);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collect(v, numbers, strings);
  }
}

/**
 * The figures in `text` that no tool result and no part of the user's
 * message backs. Each entry is a label: "₱1,000", "PWR-009-99" or "300 W".
 * An empty list means the answer is grounded.
 */
export function ungrounded(text: string, toolResults: unknown[], userText: string): string[] {
  const numbers = new Set<number>();
  const strings: string[] = [];
  for (const r of toolResults) collect(r, numbers, strings);
  // The user's own numbers: "my fan is 60 W", "under ₱500". These are quoted back, not invented.
  for (const m of userText.matchAll(NUMBER)) numbers.add(toNumber(m[0]));
  const haystack = strings.join('\n') + '\n' + userText;
  // Codes can also arrive as an object key or a non-string leaf, so search the raw JSON too.
  const raw = JSON.stringify(toolResults);

  const f = extractFigures(text);
  const out: string[] = [];
  for (const n of f.pesos) {
    if (!numbers.has(n)) out.push(`₱${n.toLocaleString('en-US')}`);
  }
  for (const c of f.codes) {
    if (!haystack.includes(c) && !raw.includes(c)) out.push(c);
  }
  for (const w of f.watts) {
    if (!numbers.has(w)) out.push(`${w.toLocaleString('en-US')} W`);
  }
  return out;
}

/** The ₱ figures only. scripts/grade.ts asserts on prices, as it did in Week 14. */
export function ungroundedPesos(text: string, toolResults: unknown[], userText: string): string[] {
  return ungrounded(text, toolResults, userText).filter((s) => s.startsWith('₱'));
}
