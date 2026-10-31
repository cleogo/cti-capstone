# Week 14 baseline

This capstone started as a clone of the Week 14 CTI Product Assistant. That app
is graded and still live, so treat it as read-only. Read it for history; build
here.

| What | Where |
|---|---|
| Local folder | `C:\Users\xyryz\OneDrive\Desktop\PROJECTS\cti-product-assistant` (`../cti-product-assistant`) |
| Frozen commit | tag `week14-submission` → `02ea4e9`, in both repos |
| GitHub repo | https://github.com/cleogo/cti-product-assistant — remote `week14` here. Do not push to it from the capstone |
| Live app | https://cti-product-assistant.vercel.app |
| Upstash index | the one in that app's Vercel env. The capstone needs its own (see `CLAUDE.md`) |

## What the baseline already gives you

WBS package 1 (baseline app) is complete: corpus pipeline, 1,038-record vector
seed, hybrid `searchProducts`, `filterProducts` with exact counts, the grounded
prompt and refusals, chat UI with source cards and chips, the masterlist PDF
with page citations, and the 65-assertion grading harness. `docs/technical-summary.md`
describes all of it in two pages.

## Week 14 docs, and where they are now

| Doc | Here |
|---|---|
| Build plan, milestones M1–M7, decisions | `docs/week14/plan.md` |
| Reflection material and demo questions | `docs/week14/reflection-outline.md` |
| Contracts (prompt rules, tool schemas) | `docs/spec.md` — still current |
| Corpus rationale | `docs/corpus-design-decisions.md` — still current |
| The 5 conflicting codes | `docs/data-quality-report.md` — still current |

Code comments that cite "docs/plan.md, M4" and similar now point at
`docs/week14/plan.md`.

## Source material outside the repo

- **Catalogue sheet PNGs** (private; input to `extract_catalogue_specs.py`):
  `C:\Users\xyryz\Downloads\2. PRICELIST -  PRIVATE (COMPLETE)` and
  `C:\Users\xyryz\Downloads\1. PRICELIST - PRIVATE (Incomplete, yellow tag only)`.
  Some folders also hold zips with extra sheets.
- **Google Drive folders** for item photos, pricelists and Bluetti photos:
  `docs/sources.md`.
