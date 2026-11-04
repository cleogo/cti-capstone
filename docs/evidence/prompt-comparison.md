# Prompt comparison: v1, v2, v3 (PRD §9)

Same chat model (`gpt-4o-mini`), same tools, same 30 golden questions and the same 37 scenarios for every variant. The default prompt in the code is **v1**.

- **v1**: rules. The Week 14 rules plus the M2 to M5 rules, numbered, with named failure modes.
- **v2**: v1 condensed to the same 15 rules, plus 4 worked examples (a compare, a power sizing, a refusal, an escalation). Examples use placeholders, not real prices.
- **v3**: v2 plus a plan inside `<plan>` tags before the first tool call of a multi-step request. `stripPlan` removes it before the client sees the text.

## How to reproduce

```bash
npx tsx scripts/eval-rag.ts --variant v2
npx tsx scripts/eval-tools.ts --variant v2
eval\.venv\Scripts\python eval/ragas_eval.py --variant v2
npx tsx scripts/eval-judge.ts --variant v2
npm run eval:report
```

Repeat with `v1` and `v3`. Every value below is read from `eval/out/`.

## Result

| | v1 | v2 | v3 |
|---|---|---|---|
| System prompt size (about tokens) | 2922 | 1811 | 1939 |
| Task completion, all 37 scenarios | 91.9% (34/37) | 78.4% (29/37) | 75.7% (28/37) |
| Task completion, 16 normal | 87.5% (14/16) | 75.0% (12/16) | 75.0% (12/16) |
| Tool-selection accuracy | 88.6% (31/35) | 82.9% (29/35) | 77.1% (27/35) |
| Argument accuracy | 89.5% (17/19) | 78.9% (15/19) | 73.7% (14/19) |
| Graceful-failure rate | 100.0% (8/8) | 100.0% (8/8) | 100.0% (8/8) |
| F2 refusal set | 100.0% (10/10) | 90.0% (9/10) | 90.0% (9/10) |
| F9 escalation recall | 66.7% (4/6) | 16.7% (1/6) | 33.3% (2/6) |
| F9 false escalation | 0.0% (0/13) | 0.0% (0/13) | 0.0% (0/13) |
| RAGAS faithfulness | 0.870 | 0.795 | 0.851 |
| RAGAS answer relevancy | 0.570 | 0.577 | 0.569 |
| RAGAS context precision | 0.838 | 0.764 | 0.821 |
| RAGAS context recall | 0.747 | 0.739 | 0.747 |
| Judge: faithful items | 93.0% (40/43) | 95.3% (41/43) | 95.3% (41/43) |
| Judge: explanation quality (mean of 5) | 4.43 | 4.46 | 4.41 |
| Tokens per run (prompt plus reply, mean) | 11973 | 9795 | 10360 |
| Latency per run, p50 | 3.6 s | 3.9 s | 3.6 s |
| Latency per run, p95 | 29.9 s | 40.2 s | 20.2 s |
| Runs that ended in an error | 1 | 1 | 1 |

Tokens and latency come from the run records. The tokens are the AI SDK usage that Langfuse also records, and each run links its trace in `tool-eval.md` and `rag-eval.md`. The three variants ran one after another under the same load, with the RAG and tool runs in parallel inside each variant.

## Choice (PRD §9 rule)

The rule: the best task completion that does not lose faithfulness. "Does not lose" is fixed here as RAGAS faithfulness within 0.02 of v1 and judge-faithful rate within 5 points of v1.

Eligible: v1, v3. **Chosen by the rule: v1.**

<!-- notes -->

## Reading the comparison

Written 4 Nov 2026. These notes are hand-written. The tables above are generated.

**v1 stays the default.** It has the best task completion (91.9% against 78.4% and 75.7%). The gap is larger than the run-to-run noise (v1 ran three times: 91.9%, 91.9%, 89.2%). The rule picks v1 by itself: v2 and v3 give up 13 to 16 points of completion, and faithfulness does not make up for it.

**v2 is cheaper but loses accuracy.** The prompt is 38% smaller (1,811 against 2,922 tokens). The mean run is 18% smaller in tokens (9,795 against 11,973). The OpenAI prompt cache hides some of the saving. With v2, tool-selection accuracy falls from 88.6% to 82.9%, argument accuracy from 89.5% to 78.9%, and F9 recall from 66.7% to 16.7%. A likely cause: condensing dropped the wording that ties each trigger to `escalateToSales`, and the "search first, then escalate" order. The worked examples cover 2 of the 6 triggers. This cause is not tested.

**v3 (plan first) does not help.** The PRD hypothesis was higher task completion on the power-station flow. Completion on the 16 normal scenarios is 75.0% for both v2 and v3. v3 fails two scenarios that v2 passes: `power-no-appliances` (the model wrote a plan and made no checklist call) and `fail-unknown-code-quote` (it searched and escalated, and never called `buildQuotation`). v3 passes one scenario that v2 fails: `quote-conflict-code`. v3 costs about 6% more tokens than v2. `stripPlan` removes the `<plan>` block in the eval. It is not wired into the route, because v3 is not the default.

**Faithfulness: the two measures disagree on the order.** RAGAS faithfulness puts v1 first (0.870, then 0.851 for v3 and 0.795 for v2). The judge puts v2 and v3 first (95.3% faithful items against 93.0% for v1). The judge grades 43 items. RAGAS grades 30 answers and reads long tool results. The difference between v1 and v3 is small on both measures. v2 loses 0.075 of RAGAS faithfulness.

**The same on all three prompts.** `power-camping` crashes (invalid tool arguments). `spec-08` is routed to the checklist. `fail-unknown-appliance` is routed to the checklist. `esc-bulk` makes no ticket. These do not depend on the prompt text. They point to the tool descriptions and the route. They are targets for M9.

**Latency.** The p50 is 3.6 to 3.9 s on all three prompts. The p95 (20 to 40 s) comes from a few slow runs (one took 58 s). It does not follow the prompt. M8 builds the latency table.

**Tokens and Langfuse.** `npx tsx scripts/eval-langfuse.ts --variant v1` compares the token counts in the run records with the Langfuse observations of three traces. Input plus cached input and the output counts match on 3 of 3 traces (also 3 of 3 for v3). Latency is the wall time of each run, as measured by the harness.

**Limits of this comparison.** One model (`gpt-4o-mini`) at default temperature. One run per variant for the RAG set. One run per variant for the scenarios, plus two repeats for v1 only. So the noise estimate for v2 and v3 is borrowed from v1. The golden set is a draft until the user reviews it.
