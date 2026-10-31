# Capstone diagrams

These diagrams match docs/capstone-prd.md and render on GitHub.

## 1. System architecture

The browser sends each message to one Next.js route, which runs input guards, the cache and the agent loop. The agent calls tools that read from Upstash, the product files and the Bluetti data, and every reply passes output checks before it streams back.

```mermaid
flowchart LR
    Client["Client browser"] --> Route["Next.js route api chat with rate limit"]
    Route --> Guards["Input guards PII injection off-topic intent"]
    Guards --> Cache["Exact and semantic cache"]
    Cache --> Agent["Agent loop streamText maxSteps"]
    Agent --> Tools["Tools"]
    Agent --> Check["Output checks"]
    Check --> Client
    Tools --> Vector["Upstash Vector hybrid search"]
    Tools --> Products["products json"]
    Tools --> Sheets["Knowledge sheets"]
    Tools --> Bluetti["data bluetti"]
    Tools --> Redis["Upstash Redis tickets and memory"]
    Cache --> Redis
    Cache --> Vector
    Agent --> OpenAI["OpenAI gpt-4o-mini and embeddings"]
    Agent --> Langfuse["Langfuse traces"]
    Client --> Form["Contact form endpoint"]
    Form --> Redis
    Form --> Email["Sales email alert"]
    Email --> Sales["CTI sales inbox"]
    Staff["Staff queue Phase 2"] --> Redis
```

## 2. Request lifecycle

Each request passes the guards, then the cache, then the agent. Tool calls stream live, but the final text is held until the output checks pass, and a failed check gets one regeneration before the sales fallback.

```mermaid
sequenceDiagram
    participant Client
    participant Guard
    participant Cache
    participant Agent
    participant Tools
    participant Check
    Client->>Guard: user message
    Guard->>Guard: mask PII and classify
    alt blocked by guard
        Guard-->>Client: polite refusal and guardrail log
    else passes guard
        Guard->>Cache: masked question
        alt exact or semantic cache hit
            Cache->>Check: replay stored reply
        else cache miss
            Cache->>Agent: run agent loop
            loop tool calls
                Agent->>Tools: call tool
                Tools-->>Client: tool results stream live
                Tools-->>Agent: typed result
            end
            Agent->>Check: buffered final text
        end
        alt checks pass
            Check-->>Client: release text in chunks
            Note over Check: on pass, store reply if cache eligible
        else checks fail
            Check->>Agent: regenerate once naming failed figures
            Agent->>Check: new buffered text
            alt pass on retry
                Check-->>Client: release text in chunks
            else fail again
                Check-->>Client: please confirm with CTI sales
            end
        end
    end
```

## 3. Tool routing

The model picks one tool per intent, and it asks a clarifying question before any tool call when the request is too vague. Each tool description names what belongs to another tool, so routing errors do not go unnoticed.

```mermaid
flowchart TD
    Msg["Client message"] --> Clear{"Clear enough to act"}
    Clear -->|"No"| Ask["Ask one clarifying question"]
    Clear -->|"Yes"| Intent{"Main intent"}
    Intent -->|"Find item by name code or description"| Search["searchProducts"]
    Intent -->|"Price threshold cheapest count or superlative"| Filter["filterProducts"]
    Intent -->|"Specs usage or advantages of one code"| Details["getProductDetails"]
    Intent -->|"Compare two to four items"| Compare["compareProducts"]
    Intent -->|"Appliance wattage in free text"| Wattage["lookupApplianceWattage"]
    Intent -->|"Which power station for my appliances"| Sizing["recommendPowerStation"]
    Intent -->|"Quote for codes and quantities"| Quote["buildQuotation"]
    Intent -->|"Stock level P1"| Stock["checkStock demo data"]
    Intent -->|"Get updates sign-up P1"| Form["showUpdatesForm client side"]
    Intent -->|"Discount delivery or warranty question"| Escalate["escalateToSales policy_question"]
    Intent -->|"Asks for a person"| Human["escalateToSales wants_human"]
    Intent -->|"Policy answer with no product data"| Guide["Answer from guide no tool"]
    Wattage --> Sizing
```

## 4. Data pipeline

Two paths feed the app. The masterlist is built into a corpus, rendered to a PDF with page numbers, then embedded into Upstash Vector. The Bluetti catalogue is cleaned into CSV files that the power-station tools read directly.

```mermaid
flowchart LR
    Xlsx["Price masterlist xlsx"] --> Build["scripts build_corpus.py"]
    Build --> Corpus["corpus folder products jsonl and guide"]
    Corpus --> PdfBuild["scripts build_pricelist_pdf.py"]
    PdfBuild --> Pdf["data cti-price-masterlist pdf"]
    PdfBuild --> Stamp["Page numbers stamped into corpus"]
    Stamp --> Seed["npm run seed"]
    Seed --> Vector["Upstash Vector 1038 records"]
    Csv1["bluetti-category csv"] --> Clean["scripts clean_bluetti.py"]
    Xlsx2["bluetti-leyte-calculator xlsx"] --> Clean
    Csv2["bluetti-prices csv CTI SRP"] --> Clean
    Clean --> BProd["data bluetti products csv"]
    Clean --> Appl["data bluetti appliances csv"]
    Clean --> Solar["data bluetti solar csv"]
    BProd --> Tools["Power sizing and wattage tools"]
    Appl --> Tools
```

## 5. Power-station recommender

The recommender collects the appliance list, computes running load, energy and usable capacity, then keeps only stations that pass every rule. When nothing passes, the agent says so and offers a way forward rather than stretching the maths.

```mermaid
flowchart TD
    Start["Client says use and hours"] --> Medical{"Medical or life-support use"}
    Medical -->|"Yes"| Flag["Show numbers and escalate life_critical"]
    Medical -->|"No"| Checklist["Appliance checklist with default watts"]
    Flag --> Checklist
    Checklist --> Free{"Appliance typed as free text"}
    Free -->|"Yes"| Lookup["lookupApplianceWattage"]
    Lookup --> Known{"Wattage found in table"}
    Known -->|"No"| Ask["Ask for nameplate watts and do not guess"]
    Ask --> Checklist
    Known -->|"Yes"| Calc["recommendPowerStation computes"]
    Free -->|"No"| Calc
    Calc --> Load["Running load = sum of running_w x qty + self-consumption"]
    Load --> Peak["Peak = running load - running_w + surge_w for largest surge gap"]
    Peak --> Energy["Energy = sum of running_w x qty x hours + self-consumption x longest hours"]
    Energy --> Usable["Usable = capacity × 0.90 × 0.85"]
    Usable --> Rules{"Rated ≥ 1.2 × load and usable ≥ energy and surge ≥ peak if on file"}
    Rules -->|"Yes"| Rank["Rank by lowest price then headroom"]
    Rank --> Explain["Smallest fit plus one step up with runtime = usable ÷ load"]
    Explain --> AddQ["Client adds to quote"]
    Rules -->|"No"| NoFit["Say nothing fits and why"]
    NoFit --> Suggest["Suggest dropping largest load or escalate no_fit"]
```

## 6. Quotation and VAT

The quotation tool builds every total itself. Prices are VAT-inclusive, so VAT is worked backwards from the total and never added on top, and the output is validated before the model sees it.

```mermaid
flowchart TD
    Req["buildQuotation with items of code and qty"] --> Valid{"Codes known and qty positive integer"}
    Valid -->|"No"| Reject["Typed error back to model"]
    Valid -->|"Yes"| Conf{"Code has conflicting price"}
    Conf -->|"Yes"| Esc["Escalate price_conflict and refer price to sales"]
    Conf -->|"No"| Line["Line total = price_php × qty"]
    Line --> Total["Total = sum of line totals VAT inclusive"]
    Total --> Net["VATable sales = total ÷ 1.12 rounded to centavo"]
    Net --> Vat["VAT = total − VATable sales"]
    Vat --> Sum["Lines add to total exactly VAT absorbs rounding"]
    Sum --> Zod{"zod schema passes"}
    Zod -->|"No"| Retry["Reject retry then escalate"]
    Zod -->|"Yes"| Draft["Draft quote with ref and validity date"]
    Draft --> Banner["Draft banner Not an order"]
```

## 7. Escalation event (Phase 1)

A conflicted price code forces a ticket in code, and the agent's later soft triggers add reasons to that same ticket. The client's contact details go straight from the form to Redis and email, so the model never sees them.

```mermaid
sequenceDiagram
    participant Client
    participant Agent
    participant Tools
    participant Redis
    participant Endpoint
    participant Email
    participant Sales
    Client->>Agent: 40 units of FIR-002-50LBS-AFFF and a discount
    Agent->>Tools: buildQuotation FIR-002-50LBS-AFFF qty 40
    Tools->>Redis: hard trigger price_conflict creates ticket CTI-0042
    Redis-->>Tools: ticket saved as Pending
    Tools-->>Agent: conflicted code rejected with ticket ref
    Tools-->>Client: escalation card with ref and contact form
    Agent->>Tools: escalateToSales policy_question soft trigger
    Tools->>Redis: append reason policy_question to same ticket
    Agent-->>Client: keeps answering the rest without a price or discount
    Note over Agent: Contact details never reach the model
    alt client submits contact
        Client->>Endpoint: name contact channel and consent
        Endpoint->>Redis: save contact and set Open
        Endpoint->>Email: alert with ref codes qty and summary
        Email->>Sales: ticket alert
        Sales->>Client: replies directly
        Note over Sales: sales closes the ticket
    else client leaves no contact
        Endpoint-->>Client: shows CTI phone and Viber
    end
```

## 8. Escalation ticket states

A ticket is created once per session and stays Pending until the client submits contact details. Phase 2 adds a staff queue where the ticket is claimed and then resolved, while the email alert stays in place.

```mermaid
stateDiagram-v2
    [*] --> Pending : escalation trigger creates ticket
    Pending --> Open : contact form submitted and saved
    Open --> Closed : sales replies and closes
    Open --> Claimed : staff claims in queue
    Claimed --> Resolved : staff resolves
    Closed --> [*]
    Resolved --> [*]
    note right of Pending : Later triggers append reasons. No contact left means phone or Viber shown
    note right of Claimed : Phase 2 only
    note right of Resolved : Phase 2 only
```

## 9. Caching decision

Four caches sit at different points: an exact reply cache for first-turn questions, a query embedding cache, a semantic cache that holds only policy answers, and a seed-time embedding cache. Every reply, cached or fresh, goes through the same output checks, and a catalogue rebuild changes the version that keys the exact and semantic caches.

```mermaid
flowchart TD
    Q["Question after input guards"] --> Gate{"First turn with no personal data stock or quote"}
    Gate -->|"Yes"| Exact{"Exact cache hit on question prompt model and catalog version"}
    Gate -->|"No"| Emb["Query embedding cache 7 days"]
    Exact -->|"Hit"| Replay["Replay stored reply and tool results"]
    Exact -->|"Miss"| Emb
    Emb --> Sem{"Semantic hit similarity 0.95 or more"}
    Sem -->|"Hit"| Replay
    Sem -->|"Miss"| Agent["Agent runs tools and drafts reply"]
    Replay --> Check{"Output checks pass"}
    Agent --> Check
    Check -->|"No"| Fallback["Regenerate once then sales fallback"]
    Check -->|"Yes"| Store["Store exact entry 24h if eligible"]
    Store --> Policy{"No product tool and no price code or watt figure"}
    Policy -->|"Yes"| SemStore["Write semantic entry 24h"]
    Policy -->|"No"| NoStore["Not written to semantic cache"]
    Version["catalog_version hash of products json and sheets changes on rebuild"] --> Exact
    Version --> Sem
    Seed["npm run seed"] --> Hash{"Chunk content hash changed"}
    Hash -->|"Yes"| Embed["Embed and upsert chunk"]
    Hash -->|"No"| Skip["Skip chunk"]
```

## 10. Evaluation loop

The RAG set and the scripted tool scenarios both run on the production prompt and tools, with every run traced in Langfuse. Each pass produces baseline numbers, one targeted change, and a re-run that reports before and after.

```mermaid
flowchart LR
    Golden["Golden set 30 questions"] --> RagRun["eval-rag runs production prompt and tools"]
    RagRun --> Jsonl["JSONL question answer contexts ground truth"]
    Jsonl --> Ragas["RAGAS faithfulness relevancy precision recall"]
    Scen["24 scripted scenarios 16 normal and 8 designed to fail"] --> Judge["Deterministic asserts and LLM judge 20 percent hand checked"]
    Unit["15 and 15 unit tests calculator and quotation"] --> Gate["npm test in CI and pre-deploy gate"]
    RagRun --> Lf["Langfuse traces for every run"]
    Judge --> Lf
    Ragas --> Base["Baseline metrics with targets faithfulness 0.90 and recall 0.85"]
    Judge --> Base
    Base --> Change["At least one targeted change"]
    Change --> Rerun["Re-run and report before and after"]
    Rerun --> Golden
    Rerun --> Scen
```

## 11. Deployment

The repo deploys from GitHub to Vercel, with secrets held only in Vercel settings and names matching the env example. The app reaches Upstash, OpenAI and Langfuse at runtime, and a Docker image reproduces it locally.

```mermaid
flowchart LR
    Repo["GitHub repo"] --> Scan["gitleaks secret scan before submission"]
    Repo --> Vercel["Vercel build and deploy"]
    Vercel --> App["Next.js app public URL"]
    Envs["Vercel env vars OPENAI_API_KEY UPSTASH LANGFUSE STAFF_PASSWORD CHAT_MODEL"] --> App
    App --> Staff["Staff pages behind STAFF_PASSWORD middleware"]
    App --> RL["Upstash Ratelimit per IP on api chat"]
    RL --> Redis["Upstash Redis"]
    App --> Vector["Upstash Vector"]
    App --> OpenAI["OpenAI API"]
    App --> Lf["Langfuse traces via LANGFUSE_HOST"]
    App --> Logs["One JSON log line per request PII masked"]
    Docker["Docker image docker run env-file .env.local"] --> App
```

## 12. Scope tiers

Each tier is built only after the one before it has evidence in the repo. P0 is what the rubric scores, P1 is the MVP extras kept thin, and P2 waits on systems or data that are not ready yet.

```mermaid
flowchart LR
    subgraph P0["P0 capstone core graded"]
        F1["F1 Browse and search"]
        F2["F2 Product details"]
        F3["F3 Compare"]
        F4["F4 Power station recommender"]
        F5["F5 Draft quotation"]
        F9["F9 Escalation"]
        G["Guardrails caching eval tracing deployment"]
    end
    subgraph P1["P1 MVP extras"]
        F6["F6 Updates sign-up"]
        F7["F7 Quote requests and staff confirm"]
        F8["F8 Demo inventory and costing"]
    end
    subgraph P2["P2 after capstone"]
        R["Real notifications"]
        Inv["CTI inventory site via adapter"]
        Cost["Real cost data"]
        FT["Fine-tuning bonus"]
    end
```
