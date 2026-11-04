/**
 * Build corpus/sheets.json from the hand-written corpus/sheets/*.md.
 *
 * Each sheet is front matter (slug, kind, codes, sources), then four ##
 * sections in a fixed order: Specs, Usage, Advantages, Cautions. Specs lines
 * are "- Label: value" so compareProducts can align rows by label.
 *
 * The build fails loudly rather than skipping a bad sheet: a sheet that
 * names a code the masterlist does not have, or that carries a price, is a
 * data error to fix at the source.
 *
 * Run:
 *   npm run build:sheets
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BY_CODE } from '../lib/products';
import type { Sheet } from '../lib/sheets';

const SHEETS_DIR = path.join(process.cwd(), 'corpus', 'sheets');
const OUT_PATH = path.join(process.cwd(), 'corpus', 'sheets.json');
const SECTIONS = ['Specs', 'Usage', 'Advantages', 'Cautions'] as const;

export function buildSheet(markdown: string, file = '<sheet>'): Sheet {
  const fail = (reason: string): never => {
    throw new Error(`${file}: ${reason}`);
  };
  const md = markdown.replace(/\r\n/g, '\n');
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return fail('no front matter');
  const [, front, body] = m;

  // Small hand parser for this front matter: scalars, one inline list
  // (codes), one block list (sources). Comments after # are dropped.
  const field = (name: string) => front.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1].replace(/\s+#.*$/, '').trim();
  const slug = field('slug') || fail('missing slug');
  const kind = field('kind');
  if (kind !== 'model' && kind !== 'type') fail(`kind must be model or type, got "${kind}"`);
  const codes = (field('codes') ?? '').replace(/^\[|\]$/g, '').split(',').map((c) => c.trim()).filter(Boolean);
  if (codes.length === 0) fail('codes list is empty');
  for (const c of codes) if (!BY_CODE.has(c.toUpperCase())) fail(`code ${c} is not in the catalogue`);
  const sources = [...(front.match(/^sources:\n((?:\s+-\s+.+\n?)*)/m)?.[1] ?? '').matchAll(/-\s+(\S+)/g)].map((x) => x[1]);
  if (sources.length === 0) fail('sources list is empty');

  if (body.includes('₱')) fail('body holds a price (₱). Prices come from the masterlist only');

  const parts = body.split(/^## /m).slice(1);
  const found = parts.map((p) => p.slice(0, p.indexOf('\n')).trim());
  for (const s of SECTIONS) if (!found.includes(s)) fail(`missing section ## ${s}`);
  if (found.join('|') !== SECTIONS.join('|')) fail(`sections out of order: ${found.join(', ')}. Expected ${SECTIONS.join(', ')}`);
  const text = (i: number) => parts[i].slice(parts[i].indexOf('\n') + 1).trim();

  const specs = text(0)
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => {
      const i = l.indexOf(':');
      if (i === -1) fail(`spec line has no "Label: value": ${l}`);
      return { label: l.slice(2, i).trim(), value: l.slice(i + 1).trim() };
    });
  if (specs.length === 0) fail('Specs section has no "- Label: value" lines');

  return { slug, kind: kind as Sheet['kind'], codes, sources, specs, usage: text(1), advantages: text(2), cautions: text(3) };
}

function main() {
  const files = fs.readdirSync(SHEETS_DIR).filter((f) => f.endsWith('.md')).sort();
  const sheets = files.map((f) => buildSheet(fs.readFileSync(path.join(SHEETS_DIR, f), 'utf-8'), f));
  const owner = new Map<string, string>();
  for (const s of sheets) {
    for (const c of s.codes) {
      if (owner.has(c)) throw new Error(`${c} is in two sheets: ${owner.get(c)} and ${s.slug}`);
      owner.set(c, s.slug);
    }
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(sheets, null, 2) + '\n');
  console.log(`Wrote ${sheets.length} sheet(s), ${owner.size} code(s), to ${path.relative(process.cwd(), OUT_PATH)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
