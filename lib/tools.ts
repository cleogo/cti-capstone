/**
 * The tools, as AI SDK definitions.
 *
 * Split out of app/api/chat/route.ts for the same reason as lib/prompt.ts:
 * `scripts/grade.ts` must route against the exact descriptions production
 * ships. A vague description causing a general-knowledge answer is a named
 * failure mode in the brief, and it is a failure of *this string*, not of the
 * system prompt — so the harness has to see the real one.
 *
 * The bodies live in lib/retrieval.ts. This module is the boundary: what the
 * model reads when deciding which tool to reach for.
 */
import { tool } from 'ai';
import { z } from 'zod';
import {
  searchProducts,
  filterProducts,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  DEFAULT_FILTER_LIMIT,
  MAX_FILTER_LIMIT,
} from '@/lib/retrieval';
import { getProductDetails, compareProducts } from '@/lib/details';
import { lookupApplianceWattage, USER_TYPES } from '@/lib/appliances';
import { recommendPowerStation } from '@/lib/power';
import { buildQuotation } from '@/lib/quote';
import { createTicket, TICKET_REASONS } from '@/lib/tickets';

const LoadSchema = z.object({
  name: z
    .string()
    .describe('appliance name AND variant, e.g. "Electric fan 14-inch standard" (the "suggested" name from lookupApplianceWattage)'),
  running_w: z.number().positive().describe('running watts for ONE unit, from lookupApplianceWattage or from the user'),
  surge_w: z
    .number()
    .positive()
    .nullable()
    .describe('start-up watts for one unit if the lookup gave one, else null'),
  qty: z.number().int().min(1).max(50),
  hours: z.number().min(0.5).max(24).describe('hours of use per day or per outage'),
});

/**
 * Both descriptions name the other tool and say what does NOT belong to them.
 * Routing failures here are symmetric — "cheapest safety shoe" going to
 * semantic search returns a confident wrong answer, and "do you sell
 * stethoscopes" going to the filter returns nothing at all — so each
 * description has to push work away as well as claim it.
 */
export const tools = {
  searchProducts: tool({
    description:
      'Find products by what they are. Semantic and keyword search across all 1,056 ' +
      'product records and the catalog guide documents. ' +
      'USE FOR: naming or describing a product ("dual head stethoscope", "fire blanket"); ' +
      'looking up a product code ("MED-001-01"); asking what something costs; asking ' +
      'whether CTI carries an item; and any conceptual question about the catalog, the ' +
      'product code structure, OSHC certification, departments, or pricelist conventions — ' +
      'those are answered from guide sections this tool returns. ' +
      'DO NOT USE FOR: price thresholds, "cheapest"/"most expensive", or "how many" — ' +
      'those need filterProducts, which counts exactly. This tool returns a ranked ' +
      'sample and cannot tell you how many items match anything. ' +
      'Exact code and name matches are returned first, and variant families are returned ' +
      'complete, so all five fire blanket sizes arrive together. Results may carry ' +
      'data_quality_flag — see the rule about conflicting codes. ' +
      'Specs, usage or cautions for a product whose code you know: use getProductDetails.',
    parameters: z.object({
      query: z
        .string()
        .describe('natural language description, product name, or product code'),
      department: z
        .string()
        .optional()
        .describe('optional department to narrow to, e.g. "Fire Safety", "Furniture"'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_SEARCH_LIMIT)
        .optional()
        .describe(
          `how many results, default ${DEFAULT_SEARCH_LIMIT}, max ${MAX_SEARCH_LIMIT}. ` +
            'Raise it for questions about a family of variants.',
        ),
    }),
    execute: async (args) => searchProducts(args),
  }),

  filterProducts: tool({
    description:
      'Query the catalog by its fields — exact, exhaustive, and not semantic. ' +
      'USE FOR: price thresholds ("under ₱500", "between ₱1,000 and ₱5,000"); superlatives ' +
      '("cheapest safety shoe", "most expensive item"); counts ("how many office chairs"); ' +
      'browsing a whole category or department; and filtering by colour or OSHC certification. ' +
      'DO NOT USE FOR: finding a product by description or code — it does no semantic ' +
      'matching, so category and department must be close to the real field values. Use ' +
      'searchProducts for that. ' +
      'ALWAYS returns total_matching: how many products match in full, before the limit. ' +
      'Report that number. Without it you will present 20 rows as though they were the ' +
      'entire catalog, which is the specific error this tool exists to prevent.',
    parameters: z.object({
      category: z
        .string()
        .optional()
        .describe(
          'category name, matched as a substring, e.g. "Safety Shoes", "Chair". ' +
            'Omit unless the question names a category — a guessed one silently ' +
            'shrinks total_matching.',
        ),
      department: z
        .string()
        .optional()
        .describe(
          'department, matched as a substring. Must be one of: Medical, Fire Safety, ' +
            'PPE, Footwear, Sports, Fall Protection, Equipment, Janitorial, Rescue, ' +
            'Furniture, Security, Traffic & Site Safety. Omit it if the question does ' +
            'not clearly name one of these — "safety equipment" is not a department, ' +
            'and narrowing it to Fire Safety answers a question nobody asked.',
        ),
      min_price: z.number().optional().describe('minimum price in PHP, inclusive'),
      max_price: z.number().optional().describe('maximum price in PHP, inclusive'),
      color: z.string().optional(),
      oshc_only: z.boolean().optional().describe('only OSHC-certified items'),
      sort: z
        .enum(['price_asc', 'price_desc', 'name'])
        .optional()
        .describe('defaults to price_asc, which is what "cheapest" wants'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_FILTER_LIMIT)
        .optional()
        .describe(
          `how many items to return, default ${DEFAULT_FILTER_LIMIT}, max ${MAX_FILTER_LIMIT}. ` +
            'This caps the list, never total_matching.',
        ),
    }),
    execute: async (args) => filterProducts(args),
  }),

  getProductDetails: tool({
    description:
      'Get the knowledge sheet for ONE product by its exact code: specs, usage, advantages, ' +
      'cautions and the source URL, plus its masterlist record and price. ' +
      'USE FOR: "what are the specs of PWR-001-06", "what is X used for", "any cautions for X", ' +
      'once you have a product code. ' +
      'DO NOT USE FOR: a price question ("how much is MED-001-01") — use searchProducts; ' +
      'finding a product by name or description, or when the user gives no code — call ' +
      'searchProducts first to get the code. Two or more products: use compareProducts. ' +
      'Returns status: "on_file" (a sheet exists), "not_on_file" (no sheet — say the specs are ' +
      'not on file, give the code and price, offer to refer to sales; never fill in specs ' +
      'yourself), or "unknown_code".',
    parameters: z.object({
      code: z.string().describe('one exact product code, e.g. "PWR-001-06"'),
    }),
    execute: async ({ code }) => getProductDetails(code),
  }),

  compareProducts: tool({
    description:
      'Compare 2 to 4 products side by side by their exact codes. Returns one row per spec ' +
      'label with a value per product; null means "not on file" for that product. Prices come ' +
      'from the masterlist; price_php is null for a code with conflicting records. ' +
      'USE FOR: "compare PWR-001-06 and PWR-001-05", "which of A or B suits X", once ' +
      'you have the codes. Never for "which is better quality" — no sheet rates quality. ' +
      'DO NOT USE FOR: one product (use getProductDetails), finding products by description ' +
      '(use searchProducts first to get the codes), or ranking by price or counting (use filterProducts).',
    parameters: z.object({
      codes: z.array(z.string()).min(2).max(4).describe('2 to 4 exact product codes'),
    }),
    execute: async ({ codes }) => {
      try {
        return compareProducts(codes);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),

  lookupApplianceWattage: tool({
    description:
      'Get the running watts (and start-up surge watts, if on file) of ONE appliance from CTI\'s ' +
      'Bluetti wattage table. Understands client words: "ref", "aircon 1hp", "TV", "electric fan", ' +
      '"bentilador". ' +
      'USE FOR: every appliance the user names when they want a power station sized. Call it once per ' +
      'appliance, before recommendPowerStation. ' +
      'DO NOT USE FOR: CTI products or prices (use searchProducts), or when the user already gave the ' +
      'watts ("my fan is 60 W") — use their figure. ' +
      'Returns status "found" with matches (one row per variant), or "unknown". On "unknown", ask the ' +
      'user for the watts from the appliance label. Never guess a wattage. ' +
      'When all matches are one appliance, "suggested" holds the variant to use if the user named ' +
      'no variant: pass its name, running_w and surge_w to recommendPowerStation unchanged. When ' +
      'there is no "suggested", the matches are different appliances: ask the user which one.',
    parameters: z.object({
      query: z.string().describe('one appliance, e.g. "ref 16 cu ft", "aircon 1hp", "32 inch TV"'),
    }),
    execute: async ({ query }) => lookupApplianceWattage(query),
  }),

  recommendPowerStation: tool({
    description:
      'Size a BLUETTI power station for a list of loads. Code computes every figure: running watts, ' +
      'start-up peak, energy needed, usable energy, runtime, and which stations fit, with the reason ' +
      'each one fails. The app shows the result as a card. ' +
      'USE FOR: "which power station for my ref and TV", "how long will X run". Call it after ' +
      'lookupApplianceWattage gave you the watts for every appliance. ' +
      'DO NOT USE FOR: a product\'s specs (use getProductDetails), or a power-station price alone ' +
      '(use searchProducts). ' +
      'Returns eligible (sorted cheapest first) and rejected stations. Never redo its arithmetic.',
    parameters: z.object({
      loads: z.array(LoadSchema).min(1).max(30),
    }),
    execute: async ({ loads }) => {
      try {
        return recommendPowerStation(loads);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),

  showApplianceChecklist: tool({
    description:
      'Show the user a checklist of common appliances to tick, with quantity and hours. The user ' +
      'submits it and you receive the selected loads. ' +
      'USE FOR: the user wants a power station but names no appliances ("I need a power station", ' +
      '"what Bluetti should I buy"). ' +
      'DO NOT USE FOR: when the user already named appliances — look those up with ' +
      'lookupApplianceWattage instead. ' +
      `userType is one of: ${USER_TYPES.join(', ')}. Use Residential unless the user named a purpose.`,
    parameters: z.object({
      userType: z.string().describe('the purpose, e.g. "Residential", "Café / Restaurant"'),
    }),
    // No execute: the browser renders the checklist and returns the result.
  }),

  buildQuotation: tool({
    description:
      'Make a draft quotation from product codes and quantities. Call it ONCE per request, with all the lines in one call. This is the ONLY way to produce a ' +
      'quotation, a quote, a total for several items, or a VAT figure. Code computes the line totals, ' +
      'the total, the VATable sales and the VAT. The app shows the result as a printable card. ' +
      'USE FOR: "quote 2 PWR-001-06", "how much for 3 of X and 5 of Y", "add it to a quote", once you ' +
      'have the codes. ' +
      'DO NOT USE FOR: the price of one unit of one item (use searchProducts), or finding a code ' +
      '(call searchProducts first). ' +
      'Returns ok:false with a reason per bad line (unknown_code, conflict_code, bad_qty, too_many_lines): ' +
      'tell the user what to fix. Returns bulk flags: if line_over_50 or total_over_500k is true, also ' +
      'call escalateToSales with reason "bulk_order". The card shows every line, price, total and VAT figure: never repeat them in your text.',
    parameters: z.object({
      items: z
        .array(
          z.object({
            code: z.string().describe('one exact product code, e.g. "PWR-001-06"'),
            qty: z.number().describe('a whole number of units, 1 to 9,999'),
          }),
        )
        .min(1)
        .max(40),
    }),
    execute: async ({ items }) => {
      try {
        const r = buildQuotation(items);
        // The model copies whatever it sees into a table unless the result
        // itself says not to. The prompt rule alone failed 4 of 4 runs (M4).
        return r.ok
          ? {
              ...r,
              reply_rule:
                'The app shows this quotation as a card with every line, price, total and VAT figure. ' +
                'Reply in at most two sentences: give the ref and say that CTI sales must confirm the draft. ' +
                'Do not list the items, prices, total or VAT.',
            }
          : r;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),

  escalateToSales: tool({
    description:
      'Refer the client to a CTI sales person. Creates a ticket for the sales team, and the app shows the ' +
      'client a contact form. Never ask for a name, phone number or email in chat: the form collects them. ' +
      'USE FOR these triggers, with the matching reason. ' +
      'conflict_code: the user wants the price of a code flagged duplicate_code_conflict. ' +
      'missing_specs: the user needs specs that getProductDetails says are not on file. ' +
      'life_critical: power for a medical or life-support device. ' +
      'commercial_terms: discount, stock, lead time, delivery, warranty or payment terms. ' +
      'bulk_order: buildQuotation returned a bulk flag. ' +
      'failed_search: two searches in this conversation found nothing that matches. ' +
      'asked_for_person: the user asks for a person, an agent or sales. ' +
      'If the question names a product and you have not called searchProducts for it yet, call ' +
      'searchProducts first, then this tool once. ' +
      'DO NOT USE FOR: a question that the catalog or the knowledge sheets answer.',
    parameters: z.object({
      reason: z.enum(TICKET_REASONS),
      summary: z
        .string()
        .max(1000)
        .describe(
          'what the client needs, with product codes and quantities, in 1 to 3 sentences. ' +
            'Never include a name, phone number, email or address.',
        ),
    }),
    execute: async ({ reason, summary }) => {
      try {
        const { id } = await createTicket({ reason, summary, sessionId: null });
        // Like buildQuotation's reply_rule: the result steers the reply text.
        // Without it the model wrote "the sales team will follow up" with no
        // refusal and no price in 2 of 5 runs (M4).
        return {
          ticket_id: id,
          reason,
          form_shown: true,
          reply_rule:
            (reason === 'commercial_terms'
              ? 'Say plainly that the masterlist does not record this, so you cannot answer it. '
              : '') +
            'Give the product code and price from the search results, if you have them. ' +
            'Say that the sales team will follow up, and that the customer can leave a name and a ' +
            'contact number or email in the form below. Do not ask for contact details in chat.',
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),
};
