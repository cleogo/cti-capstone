# CTI Product Assistant: Technical Summary

A tool-calling RAG chat app that quotes product codes and prices from CTI's price masterlist (1,038 rows, 1,027 distinct products, 12 departments, 37 categories, PHP pricing). Deployed on Vercel at https://cti-product-assistant.vercel.app.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript, Tailwind |
| LLM orchestration | Vercel AI SDK v4: `streamText` + `tool()` on the server, `useChat` on the client, `maxSteps: 5` |
| Models | `gpt-4o-mini` for chat (override with `CHAT_MODEL`), `text-embedding-3-small` for embeddings |
| Vector store | Upstash Vector (serverless REST), since Vercel's filesystem is ephemeral |
| Structured queries | None. `corpus/products.json` (~1 MB) is imported at module scope and scanned in-process |
| Corpus pipeline | Python + openpyxl (xlsx to corpus), plus a PDF renderer that stamps page numbers |

## Architecture

```
xlsx ─► build_corpus.py ─► corpus/{products.jsonl, .json, .csv, categories.json}
                            └► build_pricelist_pdf.py ─► data/cti-price-masterlist.pdf (+ `page` back into corpus)
products.jsonl + guide/*.md ─► lib/seed.ts ─► Upstash Vector (batched embedMany, 429 backoff, idempotent upsert by id)

Client (useChat) ─► POST /api/chat ─► streamText(SYSTEM_PROMPT, tools)
                                        ├─ searchProducts  ─► exact code/name maps + Upstash ANN + guide query
                                        └─ filterProducts  ─► in-memory scan, exact counts
toolInvocations ─► lib/sources.ts ─► source cards (price rendered from metadata, never from model text)
```

The route is thin on purpose. The prompt (`lib/prompt.ts`), tool schemas (`lib/tools.ts`) and retrieval bodies (`lib/retrieval.ts`) are separate modules so the eval and grading scripts run the exact code production ships.

## Retrieval design

**Chunking.** One product = one chunk, never re-chunked, so a name can't be split from its price. Guide docs (`corpus/guide/*.md`) are chunked by `##` heading.

**`searchProducts` (hybrid, ranked):**
1. Exact code match via regex `[A-Z]{3}-\d{3}(-[A-Z0-9]+)*`. If the code is a stem (`FIR-001-11`), it expands to the whole variant family.
2. Name match: exact normalized name, then token containment (every word of a 2+ word product name appears in the query, max 5).
3. Vector search, over-fetched at `topK=150` and truncated to the limit (default 12, max 20). Upstash ANN recall was poor at small topK: a fire blanket scoring 0.824 was missing at topK 12.
4. Variant-family completion: siblings sharing a code stem are pulled in at `score - 0.001`, so a five-size family never comes back as three.
5. A second query with `filter: "doc_type = 'guide'"`, `topK=3` and a score floor of 0.70, so conceptual answers get guide prose and price answers don't.

Exact hits always rank ahead of scored hits.

**`filterProducts` (metadata only, no network):** substring filters on category and department, price range, colour and OSHC. Sorts default to `price_asc`. It returns `total_matching` counted before the limit (default 20, max 50), so the model can say "214 items match" instead of passing off a truncated list as the whole catalog.

**Data quality.** 11 identical duplicate codes are collapsed in `CATALOG`. 5 codes with conflicting prices (`duplicate_code_conflict`) are kept uncollapsed so the model sees both rows and refers the customer to sales instead of picking one.

## Guardrails

- **Price integrity by construction:** source cards render `price_php` (integer) from tool metadata. The model can't change a displayed price.
- **System prompt:** 8 numbered rules mirrored in `docs/spec.md`. It must call a tool before any product answer, may only state codes and prices seen in this turn's tool results, lists every variant, and formats prices as `₱43,470.00`.
- **Scoped refusals:** stock, lead time, discounts, delivery, warranty and specs beyond the item name are declined, but the price part of the question is still answered. The refusal policy lives in the corpus so it can be retrieved.
- **Tool descriptions route both ways.** Each one says what belongs to the other tool, because thresholds, superlatives and counts sent to semantic search come back confidently wrong.
- **Citations:** each product carries a `page` from a deterministically paginated 26-page PDF. The build fails if the rendered page count drifts from the computed one.

## Verification

| Harness | Scope | Result |
|---|---|---|
| `scripts/eval.ts` | Retrieval only, no model (exact lookup, variant family, filter/count, conflict flag) | 13/13 pass |
| `scripts/grade.ts` | Real prompt, tools and model. Asserts tool routing and grounding (every ₱ figure must appear in that turn's tool results) | 65/65 assertions across 16 questions on `gpt-4o-mini`. The planned escalation to `gpt-4o` wasn't needed |
| `scripts/demo-check.ts`, `verify-prod.ts` | Same question set and rubric (R1 to R7) against the live URL | 16/16 clean |

## Out of scope

Auth, rate limiting, conversation persistence, inventory, ordering and image display. Stretch goals were capped at two: hybrid retrieval and suggested-prompt chips.
