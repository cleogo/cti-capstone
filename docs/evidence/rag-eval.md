# RAG evaluation: baseline (PRD §10.1)

Prompt **v1** (the prompt the app ships), chat model `gpt-4o-mini`, judge `gpt-4o`, 30 golden questions (`eval/golden.jsonl`).
The run goes through `createTools` and `PROMPTS`, the production modules. Targets from PRD §10.1, set before the baseline: faithfulness ≥ 0.90, context recall ≥ 0.85.

## How to reproduce

```bash
npx tsx scripts/eval-rag.ts --variant v1
eval\.venv\Scripts\python eval/ragas_eval.py --variant v1
npm run eval:report
```

## Result

| Metric | Mean | Target |
|---|---|---|
| faithfulness | 0.870 | ≥ 0.90 |
| answer_relevancy | 0.570 | none |
| llm_context_precision_with_reference | 0.838 | none |
| context_recall | 0.747 | ≥ 0.85 |

## By question kind

| Kind | n | faithfulness | answer_relevancy | llm_context_precision_with_reference | context_recall |
|---|---|---|---|---|---|
| compare | 6 | 0.855 | 0.595 | 0.940 | 0.681 |
| concept | 4 | 0.839 | 0.589 | 0.750 | 0.750 |
| price | 6 | 0.878 | 0.657 | 0.833 | 0.750 |
| refusal | 4 | 0.729 | 0.000 | 0.625 | 0.458 |
| spec | 10 | 0.949 | 0.723 | 0.900 | 0.900 |

## Run facts

- Answers with no tool call: spec-08
- Answers with a figure that no tool result or user message backs: none
- Answers that ended in an error: none
- Latency per question: p50 3.9 s, p95 32.8 s
- Tokens per question: mean 12584

## Per question

| Id | Kind | Tools | faithfulness | answer_relevancy | llm_context_precision_with_reference | context_recall | Trace |
|---|---|---|---|---|---|---|---|
| spec-01 | spec | getProductDetails | 0.952 | 0.427 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/d8946d9dd847b8e3d64e15ad46860491) |
| spec-02 | spec | searchProducts | 1.000 | 0.888 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/422b828461132ad9bf4bdd38cac1b229) |
| spec-03 | spec | searchProducts | 0.750 | 0.816 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/df6c929c032b04363cf04dc181c65b7c) |
| spec-04 | spec | getProductDetails | 1.000 | 0.716 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/39b6ac0898ee0c5edf3466fce039b74f) |
| spec-05 | spec | getProductDetails | 1.000 | 0.869 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/c13d7f6dfbc20bb839581a07bf9608fa) |
| spec-06 | spec | getProductDetails | 1.000 | 0.789 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/19aa0cf47dbdd454d786f367c075fad4) |
| spec-07 | spec | getProductDetails | 1.000 | 1.000 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/4e84b111b1ba429616b84fd30b5bbf58) |
| spec-08 | spec | showApplianceChecklist | n/a | 0.000 | 0.000 | 0.000 | [trace](https://us.cloud.langfuse.com/trace/0b34b662247a385ecb130bc8d42b8876) |
| spec-09 | spec | getProductDetails | 0.842 | 0.723 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/6415a18141c405a19ac3a37e9aae6c83) |
| spec-10 | spec | searchProducts | 1.000 | 1.000 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/108af03adf8eb98cb2ed94fb5197be79) |
| compare-01 | compare | compareProducts | 1.000 | 0.361 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/748734761c8118c9efce9b0f1c9f77df) |
| compare-02 | compare | compareProducts | 0.913 | 0.377 | 1.000 | 0.500 | [trace](https://us.cloud.langfuse.com/trace/5fd9c269c8ced9f8f66e3cc291273b5f) |
| compare-03 | compare | compareProducts | 0.909 | 0.573 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/36716cb7c8f61de9414f977f31788171) |
| compare-04 | compare | searchProducts, searchProducts, compareProducts | 0.846 | 0.777 | 0.639 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/2d580634c2c897e0235a9d99b04ffca3) |
| compare-05 | compare | compareProducts | 0.750 | 0.781 | 1.000 | 0.333 | [trace](https://us.cloud.langfuse.com/trace/dde56b0c4aeb74aa62e875eb7342feb6) |
| compare-06 | compare | compareProducts | 0.714 | 0.702 | 1.000 | 0.250 | [trace](https://us.cloud.langfuse.com/trace/dffa02ae4e161f89210e4f6175b84235) |
| price-01 | price | searchProducts | 1.000 | 0.480 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/4c67cac1f06e4b8329d9d52bb58e44d8) |
| price-02 | price | searchProducts | 1.000 | 0.778 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/c96da631874e2ff33320b0faf361a92a) |
| price-03 | price | searchProducts | 0.750 | 0.000 | 1.000 | 0.500 | [trace](https://us.cloud.langfuse.com/trace/71ca3d8d20c859c8f27097465838db15) |
| price-04 | price | searchProducts | 1.000 | 0.793 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/4ec4928d4135675344bd72967c8fccf2) |
| price-05 | price | filterProducts | 0.917 | 1.000 | 0.000 | 0.000 | [trace](https://us.cloud.langfuse.com/trace/67ecc7ccf3b34e123628e944879b3fc2) |
| price-06 | price | searchProducts | 0.600 | 0.890 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/b7a9c516606be8d84643532308d9605d) |
| concept-01 | concept | searchProducts | 1.000 | 0.642 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/e4868790ab21cc610fb528807bb279be) |
| concept-02 | concept | searchProducts | 0.857 | 0.756 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/842e73344e6f88a6e2f44251385e1529) |
| concept-03 | concept | escalateToSales | 0.500 | 0.000 | 0.000 | 0.000 | [trace](https://us.cloud.langfuse.com/trace/8676a05b0cfe907ef14888f74a81b96e) |
| concept-04 | concept | searchProducts | 1.000 | 0.957 | 1.000 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/acf7d4250c340e00b9f24c32544b85c3) |
| refusal-01 | refusal | searchProducts | 0.667 | 0.000 | 1.000 | 0.500 | [trace](https://us.cloud.langfuse.com/trace/2ea05654daaa0382c4652e60b2516d59) |
| refusal-02 | refusal | searchProducts, escalateToSales | 1.000 | 0.000 | 0.500 | 1.000 | [trace](https://us.cloud.langfuse.com/trace/2909120682b78b5618d211661e907f09) |
| refusal-03 | refusal | searchProducts | 0.750 | 0.000 | 0.000 | 0.000 | [trace](https://us.cloud.langfuse.com/trace/381ac5e8c6ddb7b6bb798e8b120164df) |
| refusal-04 | refusal | getProductDetails | 0.500 | 0.000 | 1.000 | 0.333 | [trace](https://us.cloud.langfuse.com/trace/8664d82f8204d7b146726084a08bccc9) |

A score of n/a means RAGAS could not score the row (a judge call failed, or the answer holds no claim to score).

<!-- notes -->

## Reading the baseline

Written 4 Nov 2026 after the first complete run. These notes are hand-written. The tables above are generated.

- **Both PRD targets are missed.** Faithfulness is 0.870 against 0.90. Context recall is 0.747 against 0.85. M9 picks the change that targets the weaker one.
- **Spec questions are strong. The others are not.** Spec questions score 0.949 faithfulness and 0.900 recall. They go through `getProductDetails`, which returns one sheet for one code. Compare questions have the lowest recall of the fact questions (0.681). Concept questions have the lowest context precision (0.750).
- **Refusal and count questions score low by construction.** The reference answer of a refusal describes behaviour ("the masterlist does not record stock"). No tool result holds that sentence. So context recall is 0.458 for refusals, and answer relevancy is 0.0, because RAGAS scores a noncommittal answer as irrelevant. Do not read these as defects of the app. `price-05` ("how many items under ₱500") has recall 0.0 for a similar reason: the count is a number that the filter returns, and RAGAS looks for a sentence.
- **`spec-08` ("Which solar panels do I need for the APEX300?") has no tool context.** The model called `showApplianceChecklist` and made no search. This is a routing error. It happens on all three prompts. The sheet `bluetti-pv-panels` holds the answer. A target for M9 (tool descriptions).
- **Compare by name worked in this run.** `compare-04` ("the Premium 150 and the ELITE320") called `searchProducts` twice and then `compareProducts`. In M2 it stopped after the search in 3 of 3 runs. Rule 10 in prompt V1 now says to search first and then compare. One run does not prove the fix. The answer still gives a wrong label ("Total outlets") for the ELITE320, and the judge flagged it.
- **No answer holds an invented figure.** `lib/grounding.ts` found 0 ungrounded peso figures, codes or watt figures in 30 answers.
- **Missing scores.** RAGAS gave no score to `spec-08` (no context). A row with a missing score is left out of that metric's mean. The count of such rows differs between variants (see rows with n/a in the Per question table).
- **The golden set is a draft until the user reviews it** (decision of 4 Nov). A changed reference answer needs only a re-score: `eval\.venv\Scripts\python eval/ragas_eval.py --variant v1`. A changed question needs a new run for that question.
- **RAGAS setup.** `ragas` 0.4.3 fails on import with the current `langchain-community` (no `chat_models.vertexai`). The stack is pinned to `ragas` 0.3.9 and `langchain` 0.3 in `eval/requirements.txt`. The scorer runs 10 workers with retries. RAGAS prints "LLM returned 1 generations instead of requested 3" for answer relevancy: that metric then averages fewer samples.
