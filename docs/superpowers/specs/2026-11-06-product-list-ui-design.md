# Product list, detail sheet and mobile extras — design

Date: 6 Nov 2026. Status: approved in chat, waiting for spec review.

## 1. Intent

Product answers must look like a product chatbot and read well on a phone.

- The customer sees products as UI: cards or a table. The answer text does not hold a
  product table or prices.
- A tap on a product opens its details.
- Four extras make the chat easier to use on a phone: sheet actions, follow-up chips, a
  jump-to-latest button and compare select.

Success criteria:

1. An answer with 1 to 5 products shows product cards.
2. An answer with 6 or more products shows a table.
3. A tap on a card or a row opens the detail sheet.
4. Every price on screen comes from `price_php` in a tool result.
5. The graded evidence still passes after the change.
6. At 375 px the page never scrolls sideways.

## 2. Current state

- The model writes a markdown table for several products (prompt V2, formatting rule).
- `SourceList` shows every product that the tools returned as "Sources" cards. The
  top-bar Sources toggle can hide them.
- `docs/ui-design-decisions.md` D10 item 3: the model repeats prices in its text.

## 3. Tool, prompt and eval contract

### 3.1 New tool `showProducts`

- File: `lib/display.ts` holds the logic. `lib/tools.ts` registers the tool.
- Parameters: `codes: string[]`, 1 to 50 codes, in display order.
- Result: `{ products: ProductRecord[], unknown: string[] }`.
  - Each record comes from `BY_CODE` in `lib/products.ts`: code, name, category, colours,
    `price_php`, page and `data_quality_flag`.
  - The result keeps the order of `codes` and removes duplicate codes.
  - A `duplicate_code_conflict` code appears once, with its flag and with no price.
  - A code that is not in the masterlist goes into `unknown`. The UI does not show it.
    The server logs it.
- Description (routing): "Display products to the customer as cards. Call it for EVERY
  answer that names one or more products, after searchProducts or filterProducts gives
  the codes. DO NOT USE for 2 to 4 products that the customer asked to compare (use
  compareProducts) or for a quotation (use buildQuotation)."
- Status label: "Showing products…".

### 3.2 Prompt V3

`PROMPT_V3` replaces the V2 formatting rule for products:

- Products go to the customer only through `showProducts`.
- The text has one sentence above the products. When filterProducts ran, that sentence
  starts with `total_matching`.
- The text may have one more sentence below the products.
- The text has no product table and no prices. The text may name codes.

This closes D10 item 3. V2 stays in the file, so the evidence can compare V2 and V3.

### 3.3 Eval contract

`scripts/grade.ts` reads `₱` figures from the answer text. The judge and RAGAS score the
text only. Without prices in the text, those checks break.

- Add `displayedAnswer(turn)` in `lib/display.ts`. It returns the answer text plus one
  plain line for each product in each `showProducts` result: `CODE · name · ₱price`. A
  conflict line says "price to be confirmed by sales" and has no price.
- `grade.ts`, `eval-judge.ts` and the RAGAS input score `displayedAnswer()`. This is the
  content that the customer sees.
- The grounding check (`lib/grounding.ts`) does not change.

## 4. The product list (`ProductList`)

`ProductList` renders one `showProducts` result under the answer bubble.

### 4.1 One to five products: cards

- Reuse `ProductCard`. The whole card becomes one `<button>` that opens the detail sheet.
- Phone: a horizontal snap row. A card is 160 px wide. The next card shows 24 px at the
  edge, so the reader can see that the row scrolls.
- From 640 px: a grid of up to 3 columns.
- Card content, top to bottom: photo, name (2 lines maximum, 15 px semibold), category
  (12 px gray), price from `price_php`, code (11 px mono).

### 4.2 Six or more products: table

- A real `<table>`, so a screen reader reads rows and columns.
- Phone, two columns: a 56 px photo cell, then a cell with the name (bold), the category
  (gray) and the code (mono). The price is right-aligned in the same row. A row is 72 px
  high or more. Rows use dividers, not stripes.
- From 640 px, the columns are: Photo, Product, Code, Colours, Page, Price.
- One button covers each full row (stretched-link pattern). A tap anywhere on the row
  opens the sheet. The focus order stays correct.
- The table shows 10 rows. A "Show all n" button shows the rest.

### 4.3 Both layouts

- A conflict code has a red tint, no price, no photo and an "Ask CTI sales" button.
- Cards and rows use the current enter stagger (D7).
- The list header has a "Select" button. See 6.4.

### 4.4 Sources

R4 ("retrieved sources are shown") still applies.

- The retrieved hits move into a "Sources (n)" disclosure under the answer. It is closed
  by default. It holds `SourceRow` items and the guide and sheet chips.
- The top-bar Sources toggle shows or hides this disclosure only. Product lists from
  `showProducts` always show.
- The desktop sources panel does not change.

## 5. The detail sheet (`ProductSheet`)

### 5.1 API

- `GET /api/products/[code]` calls `getProductDetails(code)` from `lib/details.ts`.
- It returns `{ status, products, sheet }`. An unknown code returns 404.
- The data is static. The route sets `Cache-Control: public, max-age=3600` and has no
  rate limit.
- The route reads `products.json` and the knowledge sheets only. It cannot return cost data.

### 5.2 Behaviour

- A native `<dialog>` opened with `showModal()`. The browser supplies the focus trap,
  Escape and the backdrop.
- Phone: a bottom sheet, 90 dvh high at most, 20 px top corners, a grab bar. The content
  scrolls inside the sheet.
- From 640 px: a centred modal, 480 px wide.
- Close controls: an X button (44 px), a tap on the backdrop, Escape, and the browser back
  gesture. On open, the sheet calls `history.pushState`. A `popstate` event closes it.
- The sheet opens at once with the record that the card already holds. Only the specs load.

### 5.3 Content, top to bottom

1. Photo: square, 280 px maximum, white background.
2. Name: 20 px bold.
3. Category: 13 px gray.
4. Price: large, from `price_php`.
5. A key-value `<dl>`: Code, Colours, Price-list page, then each spec row of the sheet.
6. Usage, Advantages and Cautions as short sections, when the sheet has them.
7. The source link of the sheet.

### 5.4 Edge states

- `not_on_file`: the text "Specifications not on file" and an "Ask CTI sales" action.
- Conflict code: a red notice. No price and no photo.
- Fetch error: the text "Specs could not load" and a Retry button.

## 6. Extras

Each action sends a normal chat prompt through the current `onAsk`. The current tools do
the work. There are no new server paths.

### 6.1 Sheet actions

- A sticky footer in the sheet with three 44 px buttons.
- "Add to quote" sends "Add CODE to my quote."
- "Compare" adds the product to the compare tray (6.4).
- "Ask sales" sends "Refer me to CTI sales about CODE."
- The sheet closes after it sends a prompt.
- A conflict code has no "Add to quote" button.

### 6.2 Follow-up chips

- Up to 3 chips, 36 px high, in a row that scrolls sideways.
- They show under the latest answer only. They do not show while that answer streams.
- A function in code picks them from the tools of that turn:

| Turn contains | Chips |
|---|---|
| `showProducts`, 2 or more products | "Compare the first two", "Show cheaper options", "Quote the first one" |
| `showProducts`, 1 product | "Show specs", "Add to a quote" |
| `recommendPowerStation` | "Quote the smallest fit", "Compare both" |
| `buildQuotation` | "Add another item", "Talk to sales" |

Each chip sends a prompt that names the codes from the tool result.

### 6.3 Jump to latest

- A round 44 px button with a down arrow, above the composer, on the right.
- It shows when the reader is more than 200 px from the end of the list.
- A gold dot shows when new content arrived after the reader scrolled up.
- It reuses the near-bottom tracking in `app/page.tsx`.

### 6.4 Compare select

- Each product list has a "Select" button in its header. A tap shows a 44 px checkbox
  on each card or row of that list. "Done" hides the checkboxes.
- The checkbox is a separate target. A tap on the rest of the card still opens the sheet.
- `app/page.tsx` holds the tray state. The tray keeps its items across answers.
- The tray holds 2 to 4 products. When the tray is full, the other checkboxes are
  disabled and a note says "4 products at most".
- A sticky bar above the composer shows "Compare (n)" and "Clear". "Compare" is enabled
  at 2 or more products. It sends "Compare A, B and C." and then clears the tray.

## 7. Testing

1. `scripts/check-display.ts`, one script with no framework. It checks:
   - `showProducts`: order kept, duplicates removed, unknown codes moved to `unknown`,
     a conflict code returned once with no price, the 50-code cap.
   - `displayedAnswer()`: product lines and the conflict line.
   - The chip picker: the table in 6.2.
2. Add routing cases to `scripts/eval-tools.ts`:
   - A list question calls `showProducts`.
   - A comparison calls `compareProducts` and not `showProducts`.
   - A quotation calls `buildQuotation` and not `showProducts`.
3. Run `grade.ts`, the judge and RAGAS on V3. Commit the new evidence under
   `docs/evidence/`. This takes about 10 minutes of model calls.
4. Check in the browser preview at 375 px and at 1280 px. Check these items:
   3 results (cards), 20 results (table), the sheet, the back gesture, compare select,
   the chips and jump to latest.
5. Save the screenshots with the evidence.

## 8. Docs

- `docs/ui-design-decisions.md`: change the D6 rows and D9. Close D10 item 3. Add D11
  "Product list and detail sheet".
- `docs/plan.md`: add one milestone for this work.

## 9. Files

| File | Change |
|---|---|
| `lib/display.ts` | New: `showProducts` logic, `displayedAnswer()`, chip picker |
| `lib/tools.ts` | Register `showProducts` |
| `lib/prompt.ts` | Add `PROMPT_V3` |
| `app/api/products/[code]/route.ts` | New: detail API |
| `app/components/ProductList.tsx` | New: cards or table, Select mode |
| `app/components/ProductSheet.tsx` | New: detail sheet and actions |
| `app/components/FollowUpChips.tsx` | New: chips |
| `app/components/SourceCard.tsx` | `ProductCard` becomes a button, with an optional checkbox |
| `app/components/SourceList.tsx` | Becomes the closed "Sources (n)" disclosure |
| `app/components/ChatMessage.tsx` | Render `ProductList` and chips |
| `app/page.tsx` | Compare tray, compare bar, jump button, sheet state |
| `scripts/check-display.ts` | New: runnable check |
| `scripts/grade.ts`, `scripts/eval-judge.ts`, `scripts/eval-tools.ts`, `eval/` RAGAS input | Score `displayedAnswer()`, routing cases |

## 10. Out of scope

- Swipe-to-close on the sheet. The X button, the backdrop, Escape and back close it.
- Image zoom in the sheet.
- New server tools other than `showProducts`.

## 11. Size and schedule

About 1.5 build days. Submission is Sun 15 Nov 2026. The work fits if it starts by
Mon 9 Nov 2026.
