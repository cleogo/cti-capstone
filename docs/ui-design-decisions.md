# UI design decisions

Status: live at `/`, 5 Nov 2026. A temporary `/preview` route held the prototype. It is
deleted now that the live chat uses these decisions.

This file records what the chat UI looks like and why. The analysis behind it is in
[ui-design-report.md](ui-design-report.md).

| File | Contents |
|---|---|
| `app/page.tsx` | Page shell: top bar, sources toggle, scroll area, composer, error notice |
| `app/components/ui.tsx` | Logo chathead, icons, photo tile, shared class strings |
| `app/components/ChatMessage.tsx` | Bubbles, tool status, typing row, one card per tool result |
| `app/components/SourceCard.tsx`, `SourceList.tsx`, `SourcesPanel.tsx` | Product photo cards, document chips, desktop panel |
| `app/components/*Card.tsx`, `ApplianceChecklist.tsx`, `ContactForm.tsx`, `QuoteList.tsx` | The response cards in D6 |
| `lib/photos.ts`, `data/product-images.json` | Photo lookup and manifest |
| `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx` | Color tokens, fonts, keyframes, reduced motion |

---

## D1. Brand: CTI gold and black

**Decision.** The UI uses the colors of the CTI logo and the catalogue sheets. It does not use
the purple "AI" palette that the design database suggested.

| Token | Hex | Use |
|---|---|---|
| `brand` | `#F2C14E` | Send button, chathead ring, quote-list button, selected rows (10 % tint) |
| `ink` | `#111111` | Top bar, user bubble, quotation header, body text |
| `paper` | `#FBF8F2` | Page background, card footers |
| `muted` | `#57534E` | Secondary text |
| `faint` | `#78716C` | Codes, captions |
| `link` | `#92400E` | Gold-family text, the quotation note |
| `line` | `#E7E2D8` | Borders, dividers, meter tracks |

**Rule.** Gold is a surface color only. Gold text on white measures 1.68:1 and fails WCAG.
Use `link` for text in the gold family.

**Why.** A customer with a printed CTI price list must see the same company on the screen.

## D2. The CTI logo is the assistant's chathead

**Decision.** `public/brand/cti-logo.png` (256 × 256, gold mark on black) is the avatar of
every assistant message, the top-bar mark, the home-screen hero (64 px) and the quotation
header. The `Logo` component in `app/components/ui.tsx` renders it as a circle with a thin
gold ring.

**Motion.** While the latest turn is working and has no text yet, a soft gold ring pulses
behind the chathead (`animate-ping`). The pulse stops when the text starts.

**Why.** The logo already sits on black, so it reads well on the black top bar and as a dark
dot beside the white assistant bubbles. A user bubble is solid `ink`, so the two speakers stay
clear.

## D3. Fonts

**Decision.** Outfit (600–700) for headings and prices. Rubik (400–500) for body text. The
system mono stack for product codes. `next/font/google` loads both fonts in `app/layout.tsx`.

**Why.** Outfit is close to the heavy, wide letters on the catalogue sheets. `next/font`
self-hosts the files, so the text does not move when the font arrives.

## D4. Layout: mobile first

The base styles target a 375 px phone. The `sm` (640 px) and `lg` (1024 px) breakpoints add
space and columns. No breakpoint takes a function away.

1. The page is one full-height column (`h-dvh`). Only the message list scrolls.
2. Sticky black top bar, 56 px: chathead logo, title, quote-list button (after a quotation),
   sources toggle, New chat. On a phone the buttons show icons only. Their text stays in the
   accessible name.
3. Message list: max width 768 px, centered. It follows new text only while the user is near
   the end, so it does not pull a reader away from an earlier answer.
4. Sticky composer: an auto-growing text area and a gold Send button. Enter sends.
   Shift+Enter adds a new line. While an answer streams, Send becomes a black Stop button.
   While the checklist waits for the user, the composer is disabled and its placeholder says
   so. The bottom padding respects the safe area of the phone.
5. On a phone, the text area uses 16 px text, so iOS does not zoom on focus.
6. Home screen: logo hero, the four prompt chips from `docs/spec.md`, and six category tiles
   with photos. On a phone the tiles are a horizontal scroll row.
7. Card rows, the compare table and the checklist scroll inside their own box. The page never
   scrolls sideways at 375 px.

## D5. Product photos

**Decision.** Photos come from the product photos that CTI supplied
(`data/raw/photos/`, gitignored, 367 MB). CTI approved publishing them on 6 Nov 2026. They
never come from model output or from the web. `lib/photos.ts` reads
`data/product-images.json`.

- `scripts/build_product_images.py` matches each photo folder to masterlist codes by name
  and writes `public/products/<CODE>.webp` (480 × 480, white background, trimmed and
  centered), the manifest and `data/product-photos-report.csv`. The WebP files are
  committed (about 9 MB).
- The masterlist is final. A folder whose name does not clearly match a masterlist name
  gets no code. A digit never fuzzes: "HAND DRYER 6667" is not HAND DRYER 6668. Extra
  folder words (a size or a colour) must agree with the code or the colours of the product.
- `data/photo-overrides.json` maps by hand the folders the rules cannot match. Each
  entry was checked against the photo.
- The report lists every code with or without a photo, and every folder that is empty or
  unmatched. On 6 Nov 2026: 853 of 1,039 codes have a photo. Most of the gap is office
  tables, empty folders and BLUETTI.
- The `alt` text is the masterlist name.
- A grey skeleton shows until the photo loads. The photo then fades in over 200 ms.
- No photo on file, or a photo that fails to load: a neutral tile with an icon. Tiles 120 px
  and wider also say "Photo not on file".
- A `duplicate_code_conflict` item never shows a photo, because the code covers two
  different products.
- BLUETTI: only studio shots taken from the front left and above, of the exact catalogue
  model, are used. On 6 Nov 2026 that is 3 of 18 codes: PWR-001-03 (AC50P), PWR-001-04
  (AC70P) and PWR-002-01 (APEX300). The supplied PV60F panel is not the catalogue PV60
  (Sora 60), so it is not used. A BLUETTI code with no photo shows a battery icon.

## D6. Response types

Every card reads structured tool data only. No card reads a price, a total, VAT or a runtime
from model text. This keeps the CLAUDE.md rule "Never render a price from model output".

| Tool | Component | Design |
|---|---|---|
| `searchProducts`, `filterProducts`, `getProductDetails` | `SourceList`, `ProductCard` | Photo cards with code, name, category, colors, price and price-list page. A horizontal scroll row on a phone. From 640 px, a 3-column grid of 6 with "Show all n". Guide sections and knowledge sheets are chips. |
| `compareProducts` | `CompareCard` | Photo and name at the head of each column. Rows: code, price, then each spec row from the knowledge sheets. A missing value says "Not on file". The label column stays fixed while the table scrolls sideways on a phone. The card row leaves out the compared products. |
| `showApplianceChecklist` | `ApplianceChecklist` | "Step 1 of 2" header, purpose menu, appliance search. A ticked row turns gold-tint and opens Qty, Hours a day and My watts. Gold "Size a power station (n)" button and Skip. After the answer, the card becomes one chip: "Checklist sent: n appliances". |
| `recommendPowerStation` | `RecommendationCard` | Load chips. Two station cards: "Smallest fit" (green ring) and "One step up". Each card shows price, runtime in large type, and three meters: power needed against rating, start-up peak against rating, energy needed against usable energy. A meter turns amber above 90 %. "How it was sized" opens the full maths table. "n stations do not fit" lists the reasons. |
| `buildQuotation` | `QuoteCard` | Document style: black header with the logo, reference and Print button. Date and valid-until line. One row per line with a photo, code, quantity × unit price and line total. VATable sales, VAT 12 % and a large total. The masterlist note at the end. Photos do not print. |
| `buildQuotation` (side effect) | `QuoteList` | A gold "Quote list (n)" button in the top bar. It opens a popover with the saved lines. Escape or a click outside closes it. This replaces the old box above the chat. |
| `escalateToSales` | `ContactForm` | Headset icon, ticket number, name and contact fields, Data Privacy Act consent. The gold Send button stays disabled until the user ticks the consent. The sent state is a green card with a check icon. |
| Price conflict | `ProductCard` | Red card: code, name, "Conflicting price on record", no price, no photo, and an "Ask CTI sales" button. The button sends "Refer me to CTI sales about the price of CODE." |
| Stream error | `page.tsx` | Red notice: "Something went wrong answering that. Your message is kept." and a Retry button that calls `reload()`. |

## D7. Motion

All motion is CSS keyframes in `tailwind.config.ts`. The app adds no animation library.

| Effect | Spec |
|---|---|
| Assistant message enters | Fade and rise 8 px, 220 ms, ease-out |
| User message enters | Fade and slide 8 px from the right, 220 ms |
| Typing | Three dots, opacity pulse, 1.2 s loop, 150 ms apart |
| Tool status | A gold band moves across the status text, 1.5 s loop. The text stays readable. |
| Chathead while working | Gold `animate-ping` ring |
| Cards enter | Fade and rise 12 px, 250 ms, 60 ms stagger (90 ms for station cards), 8 steps at most |
| Meters | Bars grow from the left, 600 ms, 200 ms delay |
| Photo load | Skeleton pulse, then a 200 ms fade |
| Press | Buttons scale to 0.97 |

**Rules.** Animate `opacity` and `transform` only. No overshoot easing on data cards. Under
`prefers-reduced-motion: reduce`, `app/globals.css` ends every animation at once.

## D8. Accessibility

- Every main control is 44 px high or more. Top-bar buttons are 40 px. In-card buttons are 36 px.
- Every control has a visible focus ring: `ink` on light surfaces, `brand` on the top bar.
- One `aria-live="polite"` region says "Answer ready" or "The answer failed to load". The
  streaming text itself is not live, so a screen reader does not read each token.
- The message list has `aria-busy` while an answer streams.
- The meters have `role="meter"` and a label. The color is never the only signal.
- A missing photo has `role="img"` and the label "Photo not on file".
- The sources toggle has `aria-pressed`.

## D9. Sources toggle

**Decision.** A "Sources" button in the top bar shows or hides all sources: the card row
under each answer and the desktop panel. The icon fills its right column when sources show.
The choice persists per browser in `localStorage` (`cti.showSources`).

- The default is on, so R4 ("retrieved sources are shown") holds for every new visitor.
- Below 1024 px, sources show under each answer. From 1024 px, the panel also shows the
  sources of the latest turn as compact rows with 40 px photos.
- Each answer keeps its own sources under it. This removes the old trade-off in which an
  earlier answer lost its sources on desktop once a later turn ran.

## D10. Open items

1. Get front-left-elevated BLUETTI photos for the other 15 codes.
2. Replace the cyan `₱` favicon (`app/icon.svg`) with the CTI logo.
3. The model still repeats prices in its text, for example in the power-station answer. The
   cards show the exact figures from code. A prompt change can make the text point to the
   cards instead.
