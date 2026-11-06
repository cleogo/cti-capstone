# Product list and detail sheet — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show products as cards (1 to 5) or a table (6 or more), open a detail sheet on
tap, and add four mobile extras.

**Architecture:** A new server tool `showProducts` returns masterlist records for the
codes that the model picks. `ProductList` renders that result. `ProductSheet` reads
`GET /api/products/[code]`. Every action sends a chat prompt through the current `ask`.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind 3, AI SDK v4 (`tool`,
`parameters`, `toolInvocations`), zod, `node:test` through `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-06-product-list-ui-design.md`

## Global Constraints

- Every price on screen comes from `price_php` in a tool result. No price comes from model text.
- A `duplicate_code_conflict` code shows no price and no photo. It shows "Ask CTI sales".
- Prices use `formatPeso()` from `app/components/SourceCard.tsx`: `₱43,470.00`.
- Touch targets: 44 px for main controls, 36 px for in-card buttons and chips.
- At 375 px the page never scrolls sideways.
- Animate `opacity` and `transform` only. `prefers-reduced-motion` stops all animation.
- AI SDK v4 API: zod schemas go under `parameters`.
- Do not change `PROMPT_V1`, `PROMPT_V2` or `PROMPT_V3`. The M6 evidence depends on them.
- Tests use `node:test` and `node:assert/strict` in `tests/*.test.ts`. Run them with `npm test`.

## Review Focus

1. The model does not call `showProducts` (prompt v1, or a missed call). The Sources
   disclosure must then open by default, so the products stay visible. Test in Task 5.
2. The sheet closes through X, Escape or the backdrop. The sheet must remove its own
   history entry, so the next back gesture does not do nothing. Test in Task 6.
3. The model sends a code in lower case or with spaces (" pwr-001-06"). `showProducts`
   must normalise it. Test in Task 1.
4. The customer opens product A, then product B before A's specs load. The sheet must
   show B's specs, never A's. Test in Task 6.
5. "New chat" must empty the compare tray and close the sheet. Test in Task 7.

## Files

| File | Responsibility |
|---|---|
| `lib/display.ts` (new) | `showProducts`, `displayedAnswer`, `pickChips`. Pure functions. |
| `tests/display.test.ts` (new) | The runnable check for `lib/display.ts`. |
| `lib/tools.ts` | Register `showProducts`. |
| `lib/prompt.ts`, `tests/prompt.test.ts` | `PROMPT_V4`. |
| `lib/sources.ts` | Skip `showProducts` results. |
| `eval/run.ts`, `eval/scenarios.ts`, `scripts/grade.ts`, `scripts/eval-judge.ts`, `scripts/eval-rag.ts` | Score the displayed answer. Routing cases. |
| `app/api/products/[code]/route.ts` (new) | Detail API. |
| `app/components/ProductList.tsx` (new) | Cards or table, Select mode. |
| `app/components/ProductSheet.tsx` (new) | Detail sheet and its actions. |
| `app/components/FollowUpChips.tsx` (new) | Chips. |
| `app/components/SourceCard.tsx`, `SourceList.tsx`, `ChatMessage.tsx`, `app/page.tsx` | Wiring, Sources disclosure, tray, jump button. |

---

### Task 1: `showProducts` and the tool registration

**Files:**
- Create: `lib/display.ts`, `tests/display.test.ts`
- Modify: `lib/tools.ts` (add after `compareProducts`), `app/components/ChatMessage.tsx` (`TOOL_STATUS_LABEL`)

**Interfaces:**
- Consumes: `BY_CODE: Map<string, Product[]>` from `lib/products.ts` (upper-case keys).
- Produces in `lib/display.ts`:
  - `export type ShownProduct = { code: string; name: string; category?: string; price_php: number | null; colors?: string[]; page?: number; data_quality_flag?: string }`
    (`ProductSource` from `lib/sources.ts` is assignable to it.)
  - `export type ShowProductsResult = { products: ShownProduct[]; unknown: string[] }`
  - `export const MAX_SHOWN = 50`
  - `export function showProducts(codes: string[]): ShowProductsResult`

- [ ] **Step 1: Write the failing tests in `tests/display.test.ts`**

```ts
test('showProducts keeps order and drops duplicates', () => {
  const r = showProducts(['MED-001-01', 'PWR-001-06', 'MED-001-01']);
  assert.deepEqual(r.products.map((p) => p.code), ['MED-001-01', 'PWR-001-06']);
  assert.equal(r.products[1].price_php, 58719);
});
test('showProducts normalises case and spaces', () => {
  assert.equal(showProducts([' pwr-001-06 ']).products[0].code, 'PWR-001-06');
});
test('showProducts moves unknown codes out', () => {
  const r = showProducts(['PWR-001-06', 'XXX-999-99']);
  assert.deepEqual(r.unknown, ['XXX-999-99']);
  assert.equal(r.products.length, 1);
});
test('a conflict code shows once, flagged, with no price', () => {
  const r = showProducts(['FLA-001-13']);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].price_php, null);
  assert.equal(r.products[0].data_quality_flag, 'duplicate_code_conflict');
});
test('showProducts caps at MAX_SHOWN', () => {
  const codes = [...BY_CODE.keys()].slice(0, 60);
  assert.equal(showProducts(codes).products.length, MAX_SHOWN);
});
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL, `showProducts` is not exported.

- [ ] **Step 3: Implement `showProducts` in `lib/display.ts`.**
  `trim().toUpperCase()` each code. For a conflict code, take name, category and colours
  from the first record and set `price_php: null`. Map `page` and `category` as they are.

- [ ] **Step 4: Register the tool in `lib/tools.ts`.**
  Parameters: `z.object({ codes: z.array(z.string()).min(1).max(50).describe('product codes, in display order') })`.
  Execute: `safeExecute(() => showProducts(codes))`. Log `unknown` codes when the array is
  not empty. Description, copied from spec 3.1:
  "Display products to the customer as cards. Call it for EVERY answer that names one or
  more products, after searchProducts or filterProducts gives the codes. DO NOT USE for
  2 to 4 products that the customer asked to compare (use compareProducts) or for a
  quotation (use buildQuotation)."
  Add `showProducts: 'Showing products…'` to `TOOL_STATUS_LABEL`.

- [ ] **Step 5: Run `npm test` and `npx tsc --noEmit`.** Expected: PASS, no type errors.

- [ ] **Step 6: Commit** `lib/display.ts tests/display.test.ts lib/tools.ts app/components/ChatMessage.tsx` with the message "Add the showProducts tool".

---

### Task 2: `PROMPT_V4`

**Files:**
- Modify: `lib/prompt.ts`, `tests/prompt.test.ts`, `.env.example` (line 44 comment)

**Interfaces:**
- Produces: `PromptVersion = 'v1' | 'v2' | 'v3' | 'v4'`. `PROMPTS.v4`. `PROMPT_VARIANT=v4` is accepted.

- [ ] **Step 1: Write the failing test in `tests/prompt.test.ts`.**

```ts
test('v4 routes products to showProducts and keeps the v3 plan rule', () => {
  assert.match(PROMPTS.v4, /showProducts/);
  assert.match(PROMPTS.v4, /<plan>/);
  assert.doesNotMatch(PROMPTS.v4, /compact table/);
});
```
  Update the test "the three prompts exist" to check four prompts.

- [ ] **Step 2: Run `npm test`.** Expected: FAIL, `PROMPTS.v4` is undefined.

- [ ] **Step 3: Add `PROMPT_V4` in `lib/prompt.ts`.**
  `PROMPT_V4 = PROMPT_V3.replace(V2_FORMAT_LINE, V4_FORMAT_LINE)`. `V2_FORMAT_LINE` is the
  exact text of line 167. Throw at module load if `PROMPT_V3` does not contain it. New
  format text:
  "Products go to the customer only through showProducts. Call it once with every code you
  name, in the order you mean. Write one sentence above the products. When filterProducts
  ran, start that sentence with total_matching. You may write one sentence below. Do not
  write a product table or a price in your text. You may name codes. No bold lines."
  Update `pickVersion` and its error text for v4. The default stays `v1`.
  Update the `.env.example` comment to "v1, v2, v3 or v4".

- [ ] **Step 4: Run `npm test`.** Expected: PASS. The test "no prompt gives a real price
  or product code" also passes for v4.

- [ ] **Step 5: Commit** with the message "Add prompt v4: products through showProducts".

---

### Task 3: Score the displayed answer, and routing cases

**Files:**
- Modify: `lib/display.ts`, `tests/display.test.ts`, `eval/run.ts`, `eval/scenarios.ts`,
  `scripts/grade.ts`, `scripts/eval-judge.ts:53`, `scripts/eval-rag.ts:48`

**Interfaces:**
- Consumes: `ShowProductsResult`, `formatPeso` (move `formatPeso` from
  `app/components/SourceCard.tsx` to `lib/display.ts`, and re-export it from `SourceCard.tsx`).
- Produces: `export function displayedAnswer(text: string, results: { name: string; result: unknown }[]): string`.
  Each turn record in `eval/run.ts` gains `displayed: string`.

- [ ] **Step 1: Write the failing tests.**

```ts
test('displayedAnswer adds one line per shown product', () => {
  const out = displayedAnswer('Two items match.', [
    { name: 'showProducts', result: showProducts(['PWR-001-06', 'FLA-001-13']) },
    { name: 'searchProducts', result: [] },
  ]);
  assert.match(out, /^Two items match\.\n/);
  assert.match(out, /PWR-001-06 · .+ · ₱58,719\.00/);
  assert.match(out, /FLA-001-13 · .+ · price to be confirmed by sales/);
});
test('displayedAnswer returns the text alone when nothing was shown', () => {
  assert.equal(displayedAnswer('Hi.', []), 'Hi.');
});
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.

- [ ] **Step 3: Implement `displayedAnswer`.** Line format: `CODE · name · ₱price`. The
  conflict line ends with `price to be confirmed by sales`.

- [ ] **Step 4: Use it in the harnesses.**
  - `eval/run.ts`: set `displayed: displayedAnswer(text, results)` on each record, after the guard.
  - `scripts/eval-judge.ts:53` and `scripts/eval-rag.ts:48`: use `displayed` in place of `text`.
  - `scripts/grade.ts`: keep `{ toolName, result }` pairs in `ask()`, and run
    `quotedPrices` and the other text checks on `displayedAnswer(...)`.

- [ ] **Step 5: Add three scenarios to `eval/scenarios.ts`, group `normal`.**
  - `list-shows-products`: "What fire extinguishers do you have?" — `expectTools: [['searchProducts', 'showProducts']]`.
  - `compare-not-shown`: "Compare PWR-001-06 and PWR-001-05" — `expectTools: [['compareProducts']]`, `forbidTools: ['showProducts']`.
  - `quote-not-shown`: "Quote 2 of PWR-001-06" — `expectTools: [['buildQuotation']]`, `forbidTools: ['showProducts']`.

- [ ] **Step 6: Run `npm test` and `npx tsc --noEmit`.** Expected: PASS.

- [ ] **Step 7: Commit** with the message "Score the displayed answer in the eval harnesses".

---

### Task 4: Detail API

**Files:**
- Create: `app/api/products/[code]/route.ts`

**Interfaces:**
- Consumes: `getProductDetails(code): DetailsResult` from `lib/details.ts` (tested in `tests/details.test.ts`).
- Produces: `GET /api/products/[code]` → 200 `DetailsResult` with
  `Cache-Control: public, max-age=3600`, or 404 `{ error: 'unknown_code' }`.

- [ ] **Step 1: Implement `GET(_req: Request, { params }: { params: Promise<{ code: string }> })`.**
  Decode the code, `toUpperCase()` it, call `getProductDetails`. No rate limit.

- [ ] **Step 2: Start the preview (`npm run dev`) and request three URLs.**
  `/api/products/PWR-001-06` → 200, `status: "on_file"`.
  `/api/products/med-001-01` → 200, `status: "not_on_file"`.
  `/api/products/XXX-999-99` → 404.

- [ ] **Step 3: Commit** with the message "Add the product detail API".

---

### Task 5: `ProductList` and the Sources disclosure

**Files:**
- Create: `app/components/ProductList.tsx`
- Modify: `app/components/SourceCard.tsx`, `app/components/SourceList.tsx`,
  `app/components/ChatMessage.tsx`, `lib/sources.ts`

**Interfaces:**
- Consumes: `ShownProduct`, `ShowProductsResult`, `formatPeso`, `photoFor`, `Photo`, `stagger`.
- Produces:
  - `ProductCard({ product, i, onOpen, onAsk, selectable, selected, onToggle, selectDisabled })`.
    `product: ShownProduct`. The card body is one `<button>` that calls `onOpen(product)`.
    The checkbox shows only when `selectable` is true. It is a separate 44 px target.
  - `ProductList({ result, onOpen, onAsk, tray, onToggleTray })`.
    `tray: string[]`, `onToggleTray: (code: string) => void`, `onOpen: (p: ShownProduct) => void`.
  - `SourceList({ sources, onAsk, defaultOpen })`: a `<details>` element with summary "Sources (n)".
  - `ChatMessage` gains props `onOpen`, `tray`, `onToggleTray`.

- [ ] **Step 1: `lib/sources.ts`.** In `sourcesFromMessage`, skip an invocation whose
  `toolName` is `showProducts`.

- [ ] **Step 2: `ProductCard`.** Change the prop to `product: ShownProduct`. Wrap the
  photo and text in a `<button>`. Keep the conflict branch. Name: 15 px semibold, 2 lines.
  Category: 12 px gray. Code: 11 px mono, under the price.

- [ ] **Step 3: `ProductList`.**
  - 5 products or fewer: the snap row from `SourceList` (160 px cards, `pr-6` so the next card shows 24 px), a 3-column grid from `sm`.
  - 6 or more: a `<table>`. Phone columns: photo (56 px), Product (bold name, gray
    category, mono code), Price (right). From `sm`, add Code, Colours and Page columns.
    Rows are 72 px high or more, with `divide-y`. The name cell holds a `<button>` with
    `after:absolute after:inset-0` and the row is `relative`. That makes the full row the target.
  - Show 10 rows, then a "Show all n" button.
  - Header: the eyebrow "Products (n)" and a "Select" button. "Select" changes to "Done".
    In select mode each card and row shows its checkbox. A checkbox is disabled when
    `tray.length >= 4` and its code is not in the tray. Then a note shows: "4 products at most".

- [ ] **Step 4: `ChatMessage`.** Add `showProducts` to `RESULT_CARDS`. Render a
  `ProductList` for each `showProducts` result. Render `SourceList` with
  `defaultOpen = !invocations.some((i) => i.toolName === 'showProducts')`.
  `showSources` still hides the `SourceList` only.

- [ ] **Step 5: Check in the preview at 375 px, with `PROMPT_VARIANT=v4` in `.env.local`.**
  - "What fire extinguishers do you have?" shows a table, or cards when 5 or fewer match.
  - "Show me 3 first aid kits" shows cards. The page does not scroll sideways
    (`document.documentElement.scrollWidth === 375`).
  - With `PROMPT_VARIANT` unset (v1), the Sources disclosure is open and shows the products.

- [ ] **Step 6: Commit** with the message "Render showProducts as cards or a table".

---

### Task 6: `ProductSheet`

**Files:**
- Create: `app/components/ProductSheet.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `ShownProduct`, `GET /api/products/[code]`, `DetailsResult` (type import from `lib/details.ts`).
- Produces: `ProductSheet({ product, onClose, onAsk, onCompare })`.
  `product: ShownProduct | null` (null means closed). `onCompare: (code: string) => void`.
  `page.tsx` holds `const [sheet, setSheet] = useState<ShownProduct | null>(null)`.

- [ ] **Step 1: Build the sheet.**
  - A `<dialog>` that calls `showModal()` when `product` becomes not null.
  - Phone: `fixed inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[20px]`, a grab bar, the body scrolls.
    From `sm`: centred, `max-w-[480px]`.
  - Content order from spec 5.3: photo (280 px max), name 20 px bold, category 13 px gray,
    price, `<dl>` (Code, Colours, Price-list page, then each `sheet.specs` row), Usage,
    Advantages, Cautions, the source link.
  - Edge states from spec 5.4: `not_on_file`, conflict, fetch error with Retry.
  - Footer from spec 6.1: "Add to quote" (`onAsk('Add CODE to my quote.')`, hidden for
    a conflict code), "Compare" (`onCompare(code)`), "Ask sales"
    (`onAsk('Refer me to CTI sales about CODE.')`). A send closes the sheet.

- [ ] **Step 2: Stale-fetch guard.** Fetch inside an effect keyed on `product?.code`.
  Use an `AbortController`, and abort it in the cleanup.

- [ ] **Step 3: History.** On open, `history.pushState({ productSheet: code }, '')`.
  A `popstate` listener calls `onClose`. A close by X, Escape (`cancel` event) or the
  backdrop calls `history.back()` when `history.state?.productSheet` is set, and lets
  `popstate` close the sheet.

- [ ] **Step 4: Wire `page.tsx`.** Pass `onOpen={setSheet}` through `ChatMessage`.
  Render `<ProductSheet product={sheet} onClose={() => setSheet(null)} onAsk={ask} onCompare={addToTray} />`.

- [ ] **Step 5: Check in the preview at 375 px and 1280 px.**
  - A tap on a card opens the sheet with the photo, name, category and price at once. Specs then load.
  - PWR-001-06 shows spec rows. MED-001-01 shows "Specifications not on file".
  - Open A, close it, open B at once: B's specs show.
  - Close with X, then press back once: the browser leaves the chat page. It does not stay on the same page.
  - Escape and a backdrop tap close the sheet. Focus returns to the card.

- [ ] **Step 6: Commit** with the message "Add the product detail sheet".

---

### Task 7: Chips, jump to latest, compare tray

**Files:**
- Create: `app/components/FollowUpChips.tsx`
- Modify: `lib/display.ts`, `tests/display.test.ts`, `app/components/ChatMessage.tsx`, `app/page.tsx`

**Interfaces:**
- Produces in `lib/display.ts`:
  - `export type Chip = { label: string; prompt: string }`
  - `export function pickChips(invocations: { toolName: string; result: unknown }[]): Chip[]` — 3 chips at most.
- `page.tsx` holds `tray: string[]`, `addToTray(code)`, `toggleTray(code)`, `clearTray()`.

- [ ] **Step 1: Write the failing tests.**

```ts
const shown = (codes: string[]) => ({ toolName: 'showProducts', result: showProducts(codes) });
test('chips for several products', () => {
  assert.deepEqual(pickChips([shown(['PWR-001-06', 'PWR-001-05'])]).map((c) => c.prompt), [
    'Compare PWR-001-06 and PWR-001-05.', 'Show cheaper options than these.', 'Add PWR-001-06 to my quote.',
  ]);
});
test('chips for one product', () => {
  assert.deepEqual(pickChips([shown(['PWR-001-06'])]).map((c) => c.label), ['Show specs', 'Add to a quote']);
});
test('a conflict code gets no quote chip', () => {
  assert.deepEqual(pickChips([shown(['FLA-001-13'])]).map((c) => c.label), ['Show specs']);
});
test('a quotation wins over shown products', () => {
  const q = { toolName: 'buildQuotation', result: { ok: true } };
  assert.deepEqual(pickChips([shown(['PWR-001-06']), q]).map((c) => c.label), ['Add another item', 'Talk to sales']);
});
test('no chips for a plain answer', () => assert.deepEqual(pickChips([]), []));
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.

- [ ] **Step 3: Implement `pickChips`.** Priority: `buildQuotation`, then
  `recommendPowerStation`, then the last `showProducts`. Copy the labels from spec 6.2. Prompts:
  - "Show specs" → `What are the specs of CODE?`
  - "Add to a quote", "Quote the first one", "Quote the smallest fit" → `Add CODE to my quote.`
  - "Compare both" → `Compare A and B.`, with `eligible[0]` and `eligible[1]` of the power result. Leave it out when `eligible` has fewer than 2.
  - "Add another item" → `I want to add another item to my quote.`
  - "Talk to sales" → `Refer me to CTI sales about my quotation.`

- [ ] **Step 4: `FollowUpChips`.** A scroll row of 36 px pill buttons. `ChatMessage`
  renders it under the latest assistant message only, and only when `busy` is false.
  Pass a new `isLatest` prop from `page.tsx`.

- [ ] **Step 5: Jump to latest in `page.tsx`.** An `onScroll` handler on `scroller` sets
  `away` when the distance from the end is more than 200 px. When `lastLen` changes while
  `away` is true, set `unseen`. The 44 px round button (`aria-label="Jump to latest"`)
  sits above the composer on the right. A gold dot shows `unseen`. A tap scrolls to the end
  and clears `unseen`.

- [ ] **Step 6: Compare tray in `page.tsx`.** The tray holds 4 codes at most, with no
  duplicates. When the tray is not empty, a sticky bar above the composer shows
  "Compare (n)" and "Clear". "Compare" is disabled under 2. It sends
  `Compare A, B and C.` and clears the tray. `newChat()` clears the tray and sets `sheet` to null.

- [ ] **Step 7: Run `npm test`. Then check in the preview at 375 px.**
  - The chips show after the answer ends. They do not show on older answers.
  - Scroll up during a stream: the jump button shows with the gold dot.
  - Select 2 products, tap Compare: the CompareCard shows. The tray is empty.
  - Select 1 product, tap New chat: the compare bar goes away.

- [ ] **Step 8: Commit** with the message "Add follow-up chips, jump to latest and compare select".

---

### Task 8: Docs, evidence and the spec fix

**Files:**
- Modify: `docs/ui-design-decisions.md`, `docs/plan.md`, `docs/superpowers/specs/2026-11-06-product-list-ui-design.md`
- Create: screenshots under `docs/evidence/ui/`

- [ ] **Step 1: Fix the spec.** Change `PROMPT_V3` to `PROMPT_V4` (V3 is the plan-first
  prompt). Change `scripts/check-display.ts` to `tests/display.test.ts`.

- [ ] **Step 2: `docs/ui-design-decisions.md`.** Update the D6 rows for products. Update
  D9: the toggle controls the Sources disclosure. Close D10 item 3. Add D11 "Product list
  and detail sheet" with the card and table rules, the sheet, and the four extras.

- [ ] **Step 3: `docs/plan.md`.** Add a milestone for this work after M8. Link this plan.
  Add to M10's deploy task: set `PROMPT_VARIANT=v4` in the Vercel project.

- [ ] **Step 4: Evidence.** Run `npm run eval:tools`, `npm run eval:rag`,
  `npm run eval:judge` and `scripts/grade.ts` with `PROMPT_VARIANT=v4`. About 10 minutes.
  Record v4 beside v3 in the evidence tables.

- [ ] **Step 5: Screenshots** at 375 px and 1280 px: cards, table, sheet, compare bar, chips.

- [ ] **Step 6: Commit** with the message "Record the product list UI in the docs and evidence".
