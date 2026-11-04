/**
 * Appliance wattage lookup (PRD F4, §8 wattage table).
 *
 * APPLIANCES comes from data/bluetti/appliances.json: the WATTAGE sheet of
 * CTI's Bluetti calculator, cleaned by scripts/clean_bluetti.py.
 *
 * Matching is deliberate, never fuzzy. An alias table maps client words
 * (ref, aircon, TV, bentilador) to the sheet's names. Then every remaining
 * word must appear in the row. No edit distance: a wrong appliance with a
 * confident wattage is worse than "unknown".
 */
import raw from '@/data/bluetti/appliances.json';

export type Appliance = {
  appliance: string;
  variant: string;
  running_w: number;
  surge_w: number | null;
  user_types: string[];
};

export const APPLIANCES: Appliance[] = raw as Appliance[];

export const USER_TYPES: string[] = [...new Set(APPLIANCES.flatMap((a) => a.user_types))];

const STOPWORDS = new Set(['a', 'an', 'the', 'my', 'of', 'for', 'and', 'with', 'ng', 'ang', 'mga', 'size', 'type']);

/** Client words to the sheet's words. Applied to the normalized query, in order. */
const ALIASES: [RegExp, string][] = [
  [/\b(aircon|airconditioner|air con|ac|a c|aircondition)\b/g, 'air conditioner'],
  [/\b(tv|telebisyon)\b/g, 'television'],
  [/\b(bentilador|electricfan|efan|e fan)\b/g, 'electric fan'],
  [/\b(ref|refs|ref?rigerator)\b/g, 'refrigerator'],
  [/\b(ricecooker|rice cooker)\b/g, 'rice cooker'],
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*hp\b/g, (_, n) => `${Number(n).toFixed(1)} hp`)
    .replace(/(\d+)\s*(?:"|''|-?\s*inch(?:es)?\b|-?in\b)/g, '$1 inch')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

function aliased(query: string): string[] {
  let q = normalize(query);
  for (const [re, to] of ALIASES) q = q.replace(re, to);
  // "fridge" alone means a refrigerator; "fridge freezer" is its own sheet row.
  if (!/\bfreezer\b/.test(q)) q = q.replace(/\bfridge\b/g, 'refrigerator');
  return tokens(q);
}

const NAME_TOKENS = new Map<string, string[]>();
for (const a of APPLIANCES) NAME_TOKENS.set(a.appliance, tokens(a.appliance));
const ROW_TOKENS = new Map<Appliance, Set<string>>(
  APPLIANCES.map((a) => [a, new Set([...tokens(a.appliance), ...tokens(a.variant)])]),
);

const MAX_MATCHES = 20;

export type Suggested = { name: string; running_w: number; surge_w: number | null };

export type LookupResult =
  | { status: 'found'; matches: Appliance[]; suggested?: Suggested; note?: string }
  | { status: 'unknown'; query: string };

/**
 * When every match is one appliance, the variant to size with if the user
 * named none: the highest running_w (then surge_w). Oversizing is safer than
 * undersizing (decided 4 Nov). Code picks it so the model does not have to.
 */
function withSuggested(r: LookupResult): LookupResult {
  if (r.status !== 'found') return r;
  if (new Set(r.matches.map((a) => normalize(a.appliance))).size !== 1) return r;
  const top = [...r.matches].sort(
    (a, b) => b.running_w - a.running_w || (b.surge_w ?? 0) - (a.surge_w ?? 0),
  )[0];
  return { ...r, suggested: { name: `${top.appliance} ${top.variant}`, running_w: top.running_w, surge_w: top.surge_w } };
}

export function lookupApplianceWattage(query: string): LookupResult {
  return withSuggested(match(query));
}

function match(query: string): LookupResult {
  const q = aliased(query);
  if (q.length === 0) return { status: 'unknown', query };

  // 1. An appliance whose whole name is in the query. The longest name wins,
  //    so "electric fan" beats a bare "fan".
  let best: string[] = [];
  let bestLen = 0;
  for (const [name, nt] of NAME_TOKENS) {
    if (nt.length === 0 || !nt.every((t) => q.includes(t))) continue;
    if (nt.length > bestLen) [best, bestLen] = [[name], nt.length];
    else if (nt.length === bestLen && !best.includes(name)) best.push(name);
  }
  if (best.length > 0) {
    const nameTok = new Set(best.flatMap((n) => NAME_TOKENS.get(n)!));
    const rest = q.filter((t) => !nameTok.has(t));
    const rows = APPLIANCES.filter((a) => best.includes(a.appliance));
    const narrowed = rows.filter((a) => rest.every((t) => ROW_TOKENS.get(a)!.has(t)));
    if (narrowed.length > 0) return { status: 'found', matches: narrowed.slice(0, MAX_MATCHES) };
    return {
      status: 'found',
      matches: rows.slice(0, MAX_MATCHES),
      note: `No variant matched "${rest.join(' ')}". These are all the variants on file for this appliance.`,
    };
  }

  // 2. Every query word in the appliance name or variant.
  const rows = APPLIANCES.filter((a) => q.every((t) => ROW_TOKENS.get(a)!.has(t)));
  if (rows.length > 0) return { status: 'found', matches: rows.slice(0, MAX_MATCHES) };
  return { status: 'unknown', query };
}

export function checklistFor(userType: string): Appliance[] {
  const want = userType.trim().toLowerCase();
  return APPLIANCES.filter((a) => a.user_types.some((t) => t.toLowerCase() === want));
}
