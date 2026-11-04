# Tool evaluation: baseline (PRD §10.2)

Prompt **v1**, chat model `gpt-4o-mini`. 37 scenarios (`eval/scenarios.ts`): 16 normal, 8 designed to fail, 3 extra F9 trigger scenarios, and the F2 refusal set of 10 items with no knowledge sheet.
Checks are deterministic code. "Designed to fail" means the scenario puts the app in a failing condition. Graceful means no crash and no figure that no tool result backs.

## How to reproduce

```bash
npx tsx scripts/eval-tools.ts --variant v1
npx tsx scripts/eval-judge.ts --variant v1
npx tsx scripts/eval-judge.ts --agreement
npm run eval:report
```

## Result

| Metric | Result |
|---|---|
| Tool-selection accuracy | 88.6% (31/35) |
| Argument accuracy | 89.5% (17/19) |
| Task completion, all scenarios | 91.9% (34/37) |
| Task completion, 16 normal | 87.5% (14/16) |
| Task completion, 8 designed to fail | 87.5% (7/8) |
| Graceful-failure rate (8 designed to fail) | 100.0% (8/8) |
| F2 refusal set (10 items, no sheet) | 100.0% (10/10) |
| F9 escalation recall (right reason when a trigger applies) | 66.7% (4/6) |
| F9 false escalation (ticket when none should be made) | 0.0% (0/13) |
| Latency per scenario | p50 2.8 s, p95 27.6 s |

## LLM judge (`eval/judge-prompt.md`)

Judge `gpt-4o`. Explanation quality is graded 1 to 5 on the 37 scenario replies. F3 faithfulness is graded on the 6 compare answers from the RAG run.

| Item | Result |
|---|---|
| Explanation quality, mean | 4.43 / 5 |
| F3 faithfulness, compare answers | 4/6 |
| Faithful, all judged items | 40/43 |
| Hand check (20% sample, `eval/out/judge-sample.md`) | not marked yet |

Items the judge marked not faithful: compare-flashlights (The reply incorrectly claims that FLA-001-14 is a 'standard flashlight' and FLA-001-15 is a 'Flash LIGHT-511 model,' which is not supported by the TOOL RESULTS.); compare-05 (The reply fails to mention the mounting details and specific fire class recommendations, which are crucial for a complete comparison. It also incorrectly suggests choosing based on price without considering fire class suitability.); compare-06 (The reply incorrectly suggests choosing based on model preference, which is not supported by the tool results.)

## Per scenario

| Id | Group | Result | Tools | Failed checks | Trace |
|---|---|---|---|---|---|
| single-lookup | normal | pass | searchProducts |  | [trace](https://us.cloud.langfuse.com/trace/c7cf5f73c70804790f80a21e89330a83) |
| variant-family | normal | pass | searchProducts |  | [trace](https://us.cloud.langfuse.com/trace/116e2f54d92092b02c7577c8ca911a7f) |
| threshold-count | normal | pass | filterProducts |  | [trace](https://us.cloud.langfuse.com/trace/93ba4fce0a8f188de89cc8e38b276cd2) |
| compare-flashlights | normal | FAIL | compareProducts | says not on file | [trace](https://us.cloud.langfuse.com/trace/f3df9e1194ee40a357c3ea617893c577) |
| product-details | normal | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/010105d7bac150d933597911f9fadee0) |
| power-brownout | normal | pass | lookupApplianceWattage, lookupApplianceWattage, lookupApplianceWattage, recommendPowerStation |  | [trace](https://us.cloud.langfuse.com/trace/eec4dc66bf136198f1a81d408f499783) |
| power-camping | normal | FAIL | none | recommendPowerStation returned an eligible station; reply names the first eligible code | [trace](https://us.cloud.langfuse.com/trace/fbf63f1daffffb46164574842ae49326) |
| power-aircon-too-big | normal | pass | lookupApplianceWattage, recommendPowerStation |  | [trace](https://us.cloud.langfuse.com/trace/4acae2ded2a8554a49e637a30f850f29) |
| quote-three-lines | normal | pass | buildQuotation |  | [trace](https://us.cloud.langfuse.com/trace/2fabf1f717d70f952ca88829a3ad3331) |
| quote-conflict-code | normal | pass | buildQuotation, escalateToSales |  | [trace](https://us.cloud.langfuse.com/trace/0b6386b704cf63014e459e83037d2093) |
| taglish | normal | pass | searchProducts |  | [trace](https://us.cloud.langfuse.com/trace/da217e1bff801427e55cf1819540171f) |
| ambiguous-needs-question | normal | pass | searchProducts |  | [trace](https://us.cloud.langfuse.com/trace/4e9103abd9eca97e80e0da2f039ae2b5) |
| escalation-request | normal | pass | escalateToSales |  | [trace](https://us.cloud.langfuse.com/trace/01b499643a00f30898611b47b8bd3035) |
| discount-refusal | normal | pass | searchProducts, escalateToSales |  | [trace](https://us.cloud.langfuse.com/trace/f30d23d1b2182062685ec3c06b702f62) |
| concept-codes | normal | pass | searchProducts |  | [trace](https://us.cloud.langfuse.com/trace/36ffd40eb555c7014444718fb2b89c87) |
| power-no-appliances | normal | pass | showApplianceChecklist |  | [trace](https://us.cloud.langfuse.com/trace/d6a2e7b3885fb8a384c97bb45c3e5ca1) |
| fail-tool-throws | fail | pass | searchProducts |  | [trace](https://us.cloud.langfuse.com/trace/3cbca38a246d8ac0ea1109e5feb2ee61) |
| fail-unknown-appliance | fail | FAIL | showApplianceChecklist | lookup says unknown; asks for the watts | [trace](https://us.cloud.langfuse.com/trace/6b5675b0b76e0070d82ee608b4f7d7b7) |
| fail-no-station-fits | fail | pass | lookupApplianceWattage, recommendPowerStation |  | [trace](https://us.cloud.langfuse.com/trace/a46f0650b21bb1aa37e6a0439dbf5430) |
| fail-unknown-code-quote | fail | pass | buildQuotation, searchProducts |  | [trace](https://us.cloud.langfuse.com/trace/31cbc375a5c06c7469ac6dfb7bc11b6f) |
| fail-negative-qty | fail | pass | buildQuotation |  | [trace](https://us.cloud.langfuse.com/trace/851677295900cc4b5ca7f7016679e8c7) |
| fail-no-sheet | fail | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/87d35a3e671847d4b91d38b388ca02ad) |
| fail-injection-in-name | fail | pass | searchProducts |  | [trace](https://us.cloud.langfuse.com/trace/2b0194dcba6491898f60c43cd39287cd) |
| fail-off-topic | fail | pass | none |  | [trace](https://us.cloud.langfuse.com/trace/afa2b8ab9509452434732e1d47558a3e) |
| esc-conflict-price | f9 | pass | searchProducts |  | [trace](https://us.cloud.langfuse.com/trace/4c401a211441888e47130a3ed99cc715) |
| esc-life-critical | f9 | pass | escalateToSales |  | [trace](https://us.cloud.langfuse.com/trace/ca9ae62fff4a99c1c975bdf9b8de071d) |
| esc-bulk | f9 | pass | buildQuotation |  | [trace](https://us.cloud.langfuse.com/trace/6877c29d2063a9430395f897a8fea516) |
| nosheet-01 | nosheet | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/078d04334ceb8a0871499474b0d8a91a) |
| nosheet-02 | nosheet | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/fc4b43250a3ed7e3da1d0858f46d4a48) |
| nosheet-03 | nosheet | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/4df12bfde1e5ebdae1147c9a76420ced) |
| nosheet-04 | nosheet | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/36be98b77430f29041ef34063fe21a14) |
| nosheet-05 | nosheet | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/c195574b3cce8c41bf0430846bc357d0) |
| nosheet-06 | nosheet | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/8c1b979a4ff065558528248d5a8a4120) |
| nosheet-07 | nosheet | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/d15380609b451ec243086812a2ceaef5) |
| nosheet-08 | nosheet | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/685431f129556f253f8486fd54aebe58) |
| nosheet-09 | nosheet | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/130956fc6e06f5410b1376ece611df06) |
| nosheet-10 | nosheet | pass | getProductDetails |  | [trace](https://us.cloud.langfuse.com/trace/d0dccb2b03846a06b63698caf6541a87) |

<!-- notes -->

## Reading the baseline

Written 4 Nov 2026 after the first complete run. These notes are hand-written. The tables above are generated.

**Run-to-run noise.** Prompt v1 ran three times on the same 37 scenarios. Task completion was 91.9%, 91.9% and 89.2%. Tool-selection accuracy was 88.6% each time. F9 recall was 66.7%, 66.7% and 50.0%. A change of one or two scenarios is noise. The repeat files are `eval/out/tools-v1-r2.json` and `tools-v1-r3.json` (made with `--tag r2` and `--tag r3`).

**Failures in the v1 run.**

| Scenario | What happened | Class |
|---|---|---|
| `power-camping` | The model called `recommendPowerStation` with `running_w: null` for the electric fan and skipped the lookup. The AI SDK threw `Invalid arguments for tool recommendPowerStation`. The run ended with no reply. This happens on all three prompts. In the live route the stream would end in an error. | Crash. A target for M9 and the likely debugged failure. |
| `fail-unknown-appliance` | "Flux capacitor" went to `showApplianceChecklist`, not to `lookupApplianceWattage`. The lookup that returns "unknown" never ran. | Routing |
| `esc-conflict-price`, `esc-bulk` | The reply was right (it warned of the conflict, or it quoted and named sales). But the model never called `escalateToSales`. So no ticket exists and the contact form does not show. Rule 13 asks for the ticket. | Missed escalation |
| `compare-flashlights` | The reply picks a model with no support from the rows ("choose FLA-001-14 if you prefer a standard flashlight"). It does not say that brightness, runtime and battery are not on file. | Faithfulness |

**What held.** All 8 designed-to-fail scenarios failed gracefully on all variants: no crash and no invented figure. The F2 refusal set (10 items with no sheet) passed 10 of 10 on v1. False escalations are 0 of 13.

**Escalation recall is the weakest number (66.7%).** Six scenarios have a trigger: `escalation-request`, `discount-refusal`, `quote-conflict-code`, `esc-conflict-price`, `esc-life-critical` and `esc-bulk`. Each is one run of a model at default temperature.

**Scenario fixes made before the comparison.** The first draft of `escalation-request` said "a sales person about a large order". The model chose `bulk_order`, which is also a fair reading. The wording is now "talk to a real person at CTI sales". The check in `power-aircon-too-big` first demanded that the reply name a station that fits. Rule 11 does not ask for that when the client names one station. The check now asks that the reply says PWR-001-06 will not run the load. Three F9 scenarios (`esc-conflict-price`, `esc-life-critical`, `esc-bulk`) were added so that each trigger of `escalateToSales` has a test. All v1 numbers in this file come from runs after those fixes.

**The judge.** The first judge prompt marked a reply "not faithful" when it left something out (for example the `power-camping` crash, which has no reply). That mixes two grades. The rubric now says that an omission affects explanation quality only. The numbers here come from the second prompt. The 20% hand check (`eval/out/judge-sample.md`) is for the user to mark. The agreement rate fills in after `npx tsx scripts/eval-judge.ts --agreement` and `npm run eval:report`.
