# UI design report: CTI Product Advisor chat

Date: 5 Nov 2026. Status: proposal. No code is changed yet.

Goal: make the advisor look like a finished chat product, add motion, and show product photos.

Method: searches of the `ui-ux-pro-max` design database (design system, color, typography, UX,
Next.js). A read of every chat component in `app/`. A check of the catalogue sheets.

---

## 1. Summary

| Area | Now | Proposal |
|---|---|---|
| Brand | Slate and cyan. No CTI identity. | CTI gold `#F2C14E` and black, taken from the catalogue sheets. |
| Layout | Header text, chat list, form at the end of the page. | Sticky black top bar, centered chat column, sticky composer at the bottom. |
| Motion | One `animate-pulse` dot on tool status. | Six CSS animations with fixed timings. All of them stop under reduced motion. |
| Images | None in the repo. | 1,026 product photos cropped from the catalogue sheets, served as static WebP. |
| Cost | — | About 2.5 days in total. Section 9 splits it into three parts. |

Main finding: the photos already exist. Each catalogue sheet has a PICTURE column, and
`data/catalogue-specs.json` already links 1,026 of 1,038 products to their sheet.

---

## 2. What the database recommended, and what this report changes

The `--design-system` query ("AI chatbot product advisor B2B industrial safety equipment catalog")
returned these results:

- **Style: AI-Native UI.** Minimal chrome, streaming text, typing indicator, context cards,
  smooth reveals. **Keep.** This style fits a chat product.
- **Palette: AI purple `#7C3AED` with cyan.** **Replace.** Purple is a generic "AI startup" color.
  CTI already has a strong brand: gold, black and cream on every catalogue sheet. A customer who
  holds a printed price list must see the same company on the screen.
- **Fonts: Space Grotesk and DM Sans.** **Replace** with Outfit and Rubik (database pairing
  "Startup Bold"). The sheets use heavy, wide sans letters. Outfit is closer to them.
- **Motion: GSAP stagger with `back.out(1.4)`.** **Change** to CSS keyframes and an
  `ease-out` curve. GSAP adds about 25 KB for six simple effects. The database also says
  "don't use back.out on dense data tables". Price cards are dense data.
- **Anti-patterns: heavy chrome, slow response feedback.** **Keep.** Section 6 handles both.

The color searches for "industrial safety" returned grey with safety orange, and red with blue.
Neither matches CTI. The palette in section 3 comes from the sheets, then a contrast check.

---

## 3. Visual system

### 3.1 Color tokens

Put these in `tailwind.config.ts` under `theme.extend.colors`. Components use the token names,
never raw hex values.

| Token | Hex | Use | Contrast (measured) |
|---|---|---|---|
| `brand` | `#F2C14E` | Send button, avatar, active chip, focus ring on dark | Black text on it: 11.25:1 |
| `ink` | `#111111` | Top bar, user bubble, body text | White text on it: 18.88:1 |
| `paper` | `#FBF8F2` | Page background (sheet cream) | Ink on it: 16.5:1 |
| `card` | `#FFFFFF` | Assistant bubble, product cards | — |
| `muted` | `#57534E` | Secondary text, captions | On paper: 7.2:1 |
| `faint` | `#78716C` | Timestamps, page refs only | On white: 4.8:1 |
| `link` | `#92400E` | Links and prices in gold-themed cards | On white: 7.09:1 |
| `line` | `#E7E2D8` | Borders, dividers | — |
| `danger` | `#B91C1C` on `#FEF2F2` | Conflict flag, errors | 5.91:1 |
| `ok` | emerald 700 on emerald 50 | "Smallest fit" pick | Tailwind default |

Rule: **never put gold text on white.** It measures 1.68:1 and fails WCAG. Gold is a surface
color only. Use `link` (`#92400E`) for gold-family text.

### 3.2 Typography

- Headings: **Outfit** 600/700. Body: **Rubik** 400/500. Load both through `next/font/google`
  in `app/layout.tsx`. `next/font` self-hosts the files and sets fallback metrics, so the text
  does not move when the font arrives.
- Prices and product codes: the system mono stack with `tabular-nums`, as now.
- Body size 16 px, line height 1.5. Small text stays 12 px or more.

### 3.3 Shape and depth

- Radius: bubbles and cards `rounded-2xl`. Chips `rounded-full`.
- Shadow: one level only, `shadow-sm` with a warm tint. No glass and no gradients.
- Icons: inline SVG (Lucide shapes), 20 px, `aria-hidden` when a text label is next to them.
  Replace the `⚠` emoji in `SourceCard.tsx` with an SVG warning icon.

---

## 4. Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ■ CTI  Product Advisor                         [ New chat ]  │  black bar, sticky, 56 px
├──────────────────────────────────────────────┬───────────────┤
│                                              │ Sources       │
│  (●) Assistant bubble, white card            │ (lg and up)   │
│      ┌──────┐ ┌──────┐ ┌──────┐              │ ┌──┐ code ₱   │
│      │photo │ │photo │ │photo │  product     │ └──┘ name     │
│      │code ₱│ │code ₱│ │code ₱│  card row    │               │
│      └──────┘ └──────┘ └──────┘              │               │
│                         User bubble, ink  ▐  │               │
│                                              │               │
├──────────────────────────────────────────────┴───────────────┤
│  ┌────────────────────────────────────────────────┐ ┌──────┐ │  composer, sticky
│  │ Ask about a product, a price…                  │ │ Send │ │  gold button
│  └────────────────────────────────────────────────┘ └──────┘ │
└──────────────────────────────────────────────────────────────┘
```

Changes to `app/page.tsx`:

1. Change `<main>` to a full-height flex column (`h-dvh flex flex-col`).
2. Add a top bar: CTI mark (from `app/icon.svg`), the title, and a "New chat" button.
   The button calls `setMessages([])`.
3. Make the message list the only scroll area. Scroll to the newest message when a message
   arrives, but only if the user is already near the end of the list.
4. Keep the composer at the bottom. Change the `<input>` to an auto-growing `<textarea>`:
   Enter sends, Shift+Enter adds a new line. Keep a visible label (`sr-only` is acceptable,
   because the button text says "Send").
5. Keep `SourcesPanel` on `lg` and up. Its cards get a 40 px thumbnail (section 5).
6. Add an assistant avatar: a 28 px gold circle with the CTI mark, at the left of each
   assistant bubble.
7. Change the user bubble from `bg-cyan-600` to `bg-ink text-white`.

### 4.1 Empty state

`EmptyState.tsx` becomes the "home" view:

- The CTI mark, the heading "What can I find for you?", and the existing scope sentence.
- The four existing prompt chips, each with an icon.
- A row of six category tiles (Fire Safety, PPE, Medical, Janitorial, Power Stations,
  Signage). Each tile shows one product photo and the category name. A click sends
  "Show me <category> products". The tiles are the strongest use of the photos, because they
  show the range before the user types.

---

## 5. Product images

### 5.1 Where the photos come from

Each catalogue sheet is a 2480 × 3508 PNG with six rows: PICTURE, DESCRIPTION, CODE NO.,
RETAIL. The sheets are in the private Downloads folders named in the project memory, not in
the repo. `data/catalogue-specs.json` gives each product its sheet file
(`"sheet": "MEDICAL SUPPLY (MED-001)/1.png"`). The OCR step in
`scripts/extract_catalogue_specs.py` already finds the code text box on each sheet.

Some rows have no picture. Example: `BOD-001-18` on `BODY HARNESS (BOD-001)/1.png` has an
empty PICTURE cell.

### 5.2 Build script (new): `scripts/build_product_images.py`

Inputs: the sheet folders, `data/catalogue-specs.json`, and the OCR boxes. Steps:

1. For each product with a `sheet`, find the OCR box of its code on that sheet.
2. Get the row band: the code box center, plus and minus half the row height. Get the row
   height from the header line and the table end, divided by six.
3. Crop the PICTURE column only: from the table's left edge to the left edge of the
   DESCRIPTION header. **The crop never includes the RETAIL column.** This keeps the rule
   "sheet prices are never output".
4. Skip the cell if it is empty. Test: the standard deviation of the pixels is below a
   threshold.
5. Trim the background to the bounding box of the content. Add 8 % padding. Put the photo on a
   white square, so that grey rows and cream rows look the same.
6. Resize to 480 × 480 and save as WebP, quality 80, at `public/products/<code>.webp`.
7. Write `data/product-images.json`: `{ "<code>": { "w": 480, "h": 480 } }`.
8. Write `data/product-images-review.html`: a contact sheet of every crop with its code and
   masterlist name, for one human pass.

Skip these products. They get "Photo not on file":

- The 3 entries in `sheet_shows_other_product`. The sheet shows a different item.
- The 8 entries in `sheet_contradicts_masterlist`. The photo can be of the wrong variant.
- The 5 codes with `data_quality_flag: "duplicate_code_conflict"`.
- The 12 products with `spec_source: "masterlist"` (no sheet).

Estimated size: about 1,000 files at 15–25 KB each, so 15–25 MB in `public/`. Vercel serves
`public/` from the build output, so the ephemeral-filesystem rule does not apply.

### 5.3 Where the photos show

| Place | Component | Size | Notes |
|---|---|---|---|
| Source card | `SourceCard.tsx` | 40 × 40 | Left of the code and price |
| Product card row (new) | `ProductCard.tsx` | 160 wide | For `searchProducts` and `filterProducts` results, max 6, horizontal scroll on mobile |
| Product details | `ProductCard.tsx`, large variant | 280 wide | For `getProductDetails` |
| Compare | compare table head | 96 × 96 | One per column |
| Quote lines | `QuoteCard.tsx` | 32 × 32 | Hide in print, so the printed quote stays text only |
| Category tiles | `EmptyState.tsx` | 120 × 120 | One photo per category |

Image rules:

- Use `next/image` with `width` and `height` from `product-images.json`. The box keeps its
  space before the image loads, so the layout does not shift.
- `alt` is the masterlist `name`. It never comes from model text.
- Below the fold: `loading="lazy"` (the `next/image` default).
- No photo: show a neutral tile with a category icon and the text "Photo not on file". Never
  show a photo from a different code.
- The photo is illustrative only. The card text (name, code, `price_php`) stays the source of
  truth. Add a small caption under the large variant: "Photo from the CTI catalogue".

### 5.4 Bluetti power stations

`data/bluetti/images/` is empty in the repo, and the PWR items have no catalogue sheet photo.
Options, in order: product photos from CTI's own Bluetti material, or the "Photo not on file"
tile. Do not take photos from the Bluetti website without permission.

---

## 6. Motion

The database rules: animate one or two elements per view, use 150–300 ms for micro motion,
and respect `prefers-reduced-motion`. All six effects below are CSS keyframes in
`tailwind.config.ts`. No new dependency is necessary.

| # | Effect | Trigger | Spec |
|---|---|---|---|
| 1 | Message enter | New message in the list | Opacity 0→1, translateY 8→0 px, 220 ms, `ease-out`. User bubble starts 8 px to the right. |
| 2 | Typing indicator | `status === 'submitted'` and no token yet | Three 6 px dots, opacity pulse 1.2 s loop, 150 ms delay between dots |
| 3 | Tool status shimmer | Tool call in state `call` | Text gradient moves left to right, 1.5 s loop. Replaces the current pulse dot. Text stays readable without motion. |
| 4 | Product card stagger | Card row appears | Each card: opacity and translateY 12→0, 250 ms, 60 ms delay per card, max 6 cards |
| 5 | Image load | `onLoad` of `next/image` | Skeleton tile (`animate-pulse` on `line` color), then the photo fades in over 200 ms |
| 6 | Press feedback | Send button, chips, tiles | `active:scale-[0.97]`, 100 ms. Hover: border to `brand`, 150 ms |

Rules for all six:

- Animate `opacity` and `transform` only. Never animate `width`, `height` or `top`.
- Exit is faster than enter: 150 ms for anything that leaves.
- Streaming text needs no extra effect. The tokens already arrive one by one.
- Reduced motion: one global rule in `app/globals.css` sets animation and transition durations
  to 0.01 ms under `@media (prefers-reduced-motion: reduce)`. The final state then shows at
  once.

If the user wants more choreography later (shared-element card to detail view), add
`motion` (Framer Motion) at that time. Do not add it now.

---

## 7. Accessibility

1. Keep a visible focus ring on every control: `focus-visible:ring-2 ring-ink ring-offset-2`.
   On the black bar, use `ring-brand`.
2. Touch targets are 44 × 44 px or more: Send, chips, tiles, "New chat".
3. Status updates: one `aria-live="polite"` region announces "Answer ready" when streaming
   ends. Do not put `aria-live` on the streaming text itself. A screen reader then reads every
   token.
4. The message list gets `aria-busy="true"` while a turn streams.
5. Every icon-only control gets an `aria-label`.
6. Price color is never the only signal. The conflict flag keeps its text label.

---

## 8. Rules from CLAUDE.md that the redesign must keep

- Prices on cards still come from `price_php` through `formatPeso`. The photo work adds no
  price path.
- Sheet data never overrides the masterlist. The crop takes the picture column only.
  The name, code and alt text come from the masterlist.
- `private/` and the sheet folders never enter the repo. Only the cropped photos do.
- Print mode for `QuoteCard` must still print the quote only. Check it after the change.

---

## 9. Build plan

| Part | Work | Estimate |
|---|---|---|
| A. Look | Tokens, fonts, top bar, layout, composer, bubbles, avatar, empty state | 1 day |
| B. Motion | Six keyframes, typing indicator, reduced-motion rule | 0.5 day |
| C. Images | Crop script, review contact sheet, `ProductCard`, thumbnails in four places | 1 day |

Order: C first. The crop script is the only part with data risk, and the review pass needs a
human. A and B then build around real photos.

Lazier option: do A and C only, and limit motion to effects 1 and 2 (about 2 hours instead of
half a day). These two effects give most of the "live chat" feel.

---

## 10. Open questions

1. **Scope.** PRD §2 lists "images" as a non-goal ("Speech input, images, or a mobile app").
   That line can mean image input, not product photos. Check, and add this work to
   `docs/plan.md` as a milestone. CLAUDE.md puts P1 extras after the P0 evidence.
2. **Rights.** The sheet folder names say "PRIVATE". Check that CTI can publish the product
   photos in a public repo and on a public site. The photos can come from suppliers.
3. **Time.** Submission is Sun 15 Nov 2026, 10 days from this report. Parts A to C take about
   2.5 days.
