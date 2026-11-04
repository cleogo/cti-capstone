# Caching (M8)

PRD §12. The chat route has four cache layers. Code: `lib/cache.ts`. Tests:
`tests/cache.test.ts`.

| Layer | Store | Life | Key or match |
|---|---|---|---|
| Exact response | Redis | 24 h | hash of the question, prompt version, catalogue version and chat model |
| Semantic response | Upstash Vector, namespace `semantic-cache` | 24 h (`expires_at` in the metadata) | similarity 0.95 or more, same version tag |
| Query embedding | Redis | 7 days | hash of the query text |
| Document chunks | Upstash Vector metadata | until the text changes | `hash` of the chunk text and metadata |

## Rules

- Only the first turn of a chat can use the cache. A question with a PII mask,
  or about stock, a quote or the session ("my saved list"), skips the cache.
- The route stores a reply only when no guard event fired, no tool returned
  an error or a `degraded` result, and no side-effect tool ran
  (`escalateToSales`, `buildQuotation`, `recommendPowerStation`,
  `showApplianceChecklist`). A reply that used session memory is not stored.
- The semantic layer holds policy answers only: no tool call, no peso
  figure, no product code and no watt figure. A product answer must come from
  tool metadata, so only the exact layer stores it, with its tool results.
- A hit goes through the answer guard again, the same as a fresh reply. The
  replay sends the stored tool calls and results first, so the sources panel
  and the prices on screen still come from tool metadata.
- The response has an `x-cache` header: `hit`, `miss` or `skip`. The request
  log line has the same value in `cache`.
- A Redis or Vector failure falls through to a normal answer.

## Bench

```bash
ALLOW_BENCH_HEADERS=1 RATE_LIMIT_PER_MIN=1000 TICKET_KEY_PREFIX=bench: npx next dev -p 3200
npx tsx scripts/cache-bench.ts --url http://localhost:3200 --flush
```

The script sends 20 questions, then the same 20 again, then 20 rewordings of
them. Then it sends both sets with the response caches off (request header
`x-bench-no-cache: 1`, accepted only when `ALLOW_BENCH_HEADERS=1`). Every
request goes through the full route: rate limit, input guard, cache, answer
guard. Run on 4 Nov 2026 against the local dev server. Output:
`eval/out/cache-bench.json` and `eval/out/cache-bench.md`.

| Pass | Cache hits | Input-guard replies | p50 total (s) | p95 total (s) | p50 first byte (s) | Chat-model cost |
|---|---|---|---|---|---|---|
| on-cold | 0/20 | 5 | 4.73 | 34.84 | 2.42 | $0.0216 |
| on-repeat | 14/20 | 5 | 1.26 | 1.67 | 1.26 | $0.0019 |
| on-paraphrase | 3/20 | 6 | 4.55 | 18.39 | 2.90 | $0.0185 |
| off-repeat | 0/20 | 5 | 2.73 | 27.22 | 1.72 | $0.0215 |
| off-paraphrase | 0/20 | 6 | 4.23 | 22.74 | 1.64 | $0.0245 |

Cost is the chat model only, at the `gpt-4o-mini` list price of $0.15 and
$0.60 a million input and output tokens. It does not count the input guard,
moderation or embedding calls.

**(a) Repeated questions.** 14 of 20 hit. The p50 fell from 2.73 s to 1.26 s
and the p95 from 27.22 s to 1.67 s. The chat-model cost fell by 91 %, from
$0.0215 to $0.0019. Of the 6 that did not hit, 5 were input-guard replies,
which never reach the cache and cost no chat tokens. The other one,
"Show me stethoscopes", got `moderation:error` on both runs, and the route
does not store a reply after a guard error.

**(b) Paraphrases.** 3 of 20 hit the semantic layer: the heat alarm, the
class K extinguisher and the spine board. The cost fell by 24 %, from $0.0245
to $0.0185. The p50 did not change much, because 11 of the 14 reworded
questions that reached the model are product questions. Those carry a code
or a price, so the semantic layer does not store them. That is the design: a
product answer must come from the tool results of its own question.

## What the bench showed

- **The input guard redirects most general questions first.** "What are your
  business hours?", "Who are you?" and "Do you install the products you
  sell?" get the fixed off-topic reply in about 0.9 s and 0 chat tokens. So
  the semantic layer gets few policy answers to store.
- **The cache keeps a wrong answer for 24 hours.** "What is a spine board used
  for?" and "What is a heat alarm used for?" got "The record does not state…"
  with no tool call, but a knowledge sheet exists for both. The answer has no
  figure, so it passed the policy check and went into both layers. The fault
  is in the routing (M9). The cache makes it last longer.
- **The API was slow and unstable on 4 Nov.** Some misses took up to 49 s,
  and later the same day some calls failed with `ENOTFOUND api.openai.com`.
  The p95 figures of the "off" and "cold" passes carry this noise. The
  "on-repeat" p95 does not, because a hit makes no chat call.

## Version check

The exact key and the semantic tag both include the prompt version, the
catalogue version and the chat model. `CATALOG_VERSION` is the first 12 hex
characters of a SHA-256 of the product records and the knowledge sheets
(`lib/version.ts`).

The test: ask a question that is in the cache on a server with
`PROMPT_VARIANT=v1`, then ask it again on a server with `PROMPT_VARIANT=v2`.

Run on 4 Nov 2026, in this order, on port 3200:

| Server | Question | `x-cache` | Reply starts |
|---|---|---|---|
| v1 | What is a heat alarm used for? | hit | (exact entry from the bench) |
| v1 | What are heat alarms used for? | hit | "The masterlist does not record the specifications or usage…" |
| v2 | What is a heat alarm used for? | **miss** | "I cannot provide information on the usage of a heat alarm…" |
| v2 | What are heat alarms used for? | hit | the v2 reply of the row above |

The v2 server missed the cached v1 question. The last row hit the entry that
the v2 miss had just written. A list of the semantic namespace showed the two
tags, `v1|62ead76d9e38|gpt-4o-mini` and `v2|62ead76d9e38|gpt-4o-mini`.

Two faults found and fixed during this check:

- The first build of the semantic layer had no version tag, so a v2 server
  could replay a v1 answer. The Vector query now filters on `version`.
  Entries from before the fix have no tag, and the filter skips them.
- The entry id was the hash of the question only, so the v2 write replaced
  the v1 entry. The id now includes the tag.

## Document chunks

`npm run seed` stores a `hash` of the text and metadata on each chunk. On the
next run it reads the stored hashes and embeds only the chunks that
changed. `--force` embeds all of them.

Two runs of `npm run seed`, one after the other, on 4 Nov 2026:

| Run | Chunks embedded | Chunks skipped |
|---|---|---|
| 1 (writes the first hashes) | 1,316 (1,056 products, 20 guide, 240 sheet) | 0 |
| 2 | 0 | 1,316 |

The second run made no embedding call. Both runs report 1,325 vectors in the
index: the 1,316 chunks, plus the entries of the `semantic-cache` namespace.

## Latency of the guards

M7 measured the guard cost at about 0.8 s before the first token, and about
0.4 s of output moderation for each text step (`docs/evidence/guardrails.md`).
The bench above runs with every guard on. The API was unstable on 4 Nov, so
the guard-only measurement runs again in M10, against the live URL.
