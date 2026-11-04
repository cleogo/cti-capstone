"""RAG evaluation, step 2 of 2 (PRD 10.1).

Scores eval/out/rag-<variant>.jsonl with RAGAS: faithfulness, answer
relevancy, context precision and context recall. The judge is JUDGE_MODEL
(default gpt-4o), not the chat model.

Run (from the repo root):
    eval\\.venv\\Scripts\\python eval/ragas_eval.py --variant v1
    eval\\.venv\\Scripts\\python eval/ragas_eval.py --variant v1 --limit 3

Writes eval/out/ragas-<variant>.json and prints a Markdown table.
RAGAS runs with 10 workers and retries with backoff, for rate limits.
"""
import argparse
import json
import math
import os
import sys

from dotenv import load_dotenv

load_dotenv(".env.local")

from langchain_openai import ChatOpenAI, OpenAIEmbeddings  # noqa: E402
from ragas import EvaluationDataset, RunConfig, evaluate  # noqa: E402
from ragas.embeddings import LangchainEmbeddingsWrapper  # noqa: E402
from ragas.llms import LangchainLLMWrapper  # noqa: E402
from ragas.metrics import (  # noqa: E402
    Faithfulness,
    LLMContextPrecisionWithReference,
    LLMContextRecall,
    ResponseRelevancy,
)

JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "gpt-4o")


def mean(values):
    xs = [v for v in values if isinstance(v, (int, float)) and not math.isnan(v)]
    return (sum(xs) / len(xs)) if xs else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default=os.environ.get("PROMPT_VARIANT", "v1"))
    ap.add_argument("--limit", type=int, default=None, help="score only the first N rows (smoke test)")
    args = ap.parse_args()

    path = f"eval/out/rag-{args.variant}.jsonl"
    rows = [json.loads(line) for line in open(path, encoding="utf-8") if line.strip()]
    if args.limit:
        rows = rows[: args.limit]

    # RAGAS wants at least one context string. A reply with no tool call has none.
    dataset = EvaluationDataset.from_list(
        [
            {
                "user_input": r["question"],
                "response": r["answer"],
                "retrieved_contexts": r["contexts"] or ["(no tool was called)"],
                "reference": r["ground_truth"],
            }
            for r in rows
        ]
    )

    llm = LangchainLLMWrapper(ChatOpenAI(model=JUDGE_MODEL, temperature=0))
    emb = LangchainEmbeddingsWrapper(OpenAIEmbeddings(model="text-embedding-3-small"))
    metrics = [
        Faithfulness(),
        ResponseRelevancy(),
        LLMContextPrecisionWithReference(),
        LLMContextRecall(),
    ]
    result = evaluate(
        dataset,
        metrics=metrics,
        llm=llm,
        embeddings=emb,
        run_config=RunConfig(max_workers=10, max_retries=10, max_wait=60, timeout=240),
        batch_size=10,
        show_progress=True,
    )
    df = result.to_pandas()
    names = [c for c in df.columns if c not in ("user_input", "response", "retrieved_contexts", "reference")]

    per_row = []
    for r, (_, d) in zip(rows, df.iterrows()):
        per_row.append({"id": r["id"], "kind": r["kind"], **{n: (None if math.isnan(d[n]) else float(d[n])) for n in names}})

    kinds = sorted({r["kind"] for r in rows})
    summary = {"variant": args.variant, "judge": JUDGE_MODEL, "n": len(rows), "metrics": {}, "by_kind": {}}
    for n in names:
        summary["metrics"][n] = mean([p[n] for p in per_row])
        for k in kinds:
            summary["by_kind"].setdefault(k, {})[n] = mean([p[n] for p in per_row if p["kind"] == k])
    summary["rows"] = per_row

    out = f"eval/out/ragas-{args.variant}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    fmt = lambda v: "n/a" if v is None else f"{v:.3f}"
    print(f"\n| Metric ({args.variant}, judge {JUDGE_MODEL}, n={len(rows)}) | Mean |\n|---|---|")
    for n in names:
        print(f"| {n} | {fmt(summary['metrics'][n])} |")
    print(f"\nWrote {out}")
    nan_rows = [p["id"] for p in per_row if any(p[n] is None for n in names)]
    if nan_rows:
        print(f"Rows with a missing score (judge call failed or no claim to score): {', '.join(nan_rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
