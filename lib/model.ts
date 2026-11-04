/**
 * The chat model, in one place.
 *
 * M4 decided this by measurement rather than by assumption: the system prompt
 * was written against gpt-4o-mini and graded, with escalation to gpt-4o gated
 * on a trigger fixed in advance (docs/week14/plan.md, "Decided in M4"). Keeping the
 * id here means scripts/grade.ts and the route cannot disagree about which
 * model the evidence was gathered on.
 *
 * Override with CHAT_MODEL to re-grade against another model without editing
 * code — `CHAT_MODEL=gpt-4o npx tsx scripts/grade.ts`.
 */
export const CHAT_MODEL = process.env.CHAT_MODEL ?? 'gpt-4o-mini';

/**
 * Parallel tool calls are off. With them on, "Quote 1 PWR-001-06, 3
 * FIR-001-10LBS and 5 MED-001-01" made two buildQuotation calls in one step
 * (the second without PWR-001-06) in 4 of 4 runs, and the client saw two
 * cards. Off, it made one call in 3 of 3 runs (M4, 4 Nov). The cost: one
 * appliance lookup per step, so the route's maxSteps went from 8 to 12.
 */
export const CHAT_MODEL_SETTINGS = { parallelToolCalls: false } as const;

/** maxSteps for the route and the harnesses: one lookup per appliance, then the recommendation, then text. */
export const MAX_STEPS = 12;
