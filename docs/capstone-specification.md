# **Generative AI & Agentic AI Capstone Project**

*Project Specification — Individual Capstone* 

**1\. Overview**

In this capstone you will work as an **AI Engineer or Applied AI Consultant** inside an organisation. Your job is to design, build, deploy, and evaluate a **working Generative AI application — preferably with agentic functions — running on a real server**, the way it would be done in industry: not a toy demo, but a system meant to support real users, real workflows, and real constraints.

Unlike a guided assignment, **you choose your own application**. You will pitch your idea in a short proposal, get it approved, then ship it end-to-end: a deployed application, an evaluation that proves it works, and a demo video that explains and justifies your engineering decisions.

At a glance:

* **Format:** Individual project, completed over 2 weeks

* **Core requirements:** a Generative AI application (preferably agentic), deployed on a server, with an evaluation where applicable.

* **With** guardrails and caching (Section 6).

* **Advanced option:** fine-tuning a model (Section 7).

* **Grading:** see the accompanying Grading Rubric document. You are evaluated on engineering judgment, reliability, explainability, safety-first design, and practical usefulness — not on complexity or novelty.

# **2\. Learning Outcomes**

By completing this capstone, you will be able to:

* Frame a real-world problem as a Generative AI application with clear users, success criteria, and known risks.

* Build an LLM-powered application that uses agentic patterns: tool use, retrieval (RAG), multi-step planning, and memory.

* Deploy and operate the application on a server, with sound secret handling, logging, and error handling.

* Design and run a systematic evaluation, interpret the metrics, and iterate with evidence.

* Apply production techniques — guardrails, caching, and (optionally) fine-tuning — and measure their impact.

* Justify architecture and design decisions the way an engineer would in a design review.

# **3\. What Counts as “Agentic”?**

A Generative AI application becomes agentic when it goes beyond answering single questions. Agentic systems can:

* Reason across multiple steps and decompose tasks;

* Use tools and external APIs (search, databases, calculators, internal functions);

* Ground answers in external knowledge through retrieval (RAG);

* Maintain context and memory across turns;

* Handle ambiguity, ask clarifying questions, and escalate to humans when needed;

* Operate within explicit safety and ethical boundaries.

**Minimum expectation:** your application must have an LLM at its core and implement **at least one** agentic capability — tool/function calling, retrieval (RAG), multi-step planning, or conversational memory. Richer agentic behaviour earns higher rubric scores. A plain, ungrounded “wrapper around the chat API” is not sufficient.

Your agent should act as a **decision-support assistant**, not an autonomous system that executes real-world transactions. Avoid designs that move money, place real orders, or take irreversible actions.

# **4\. Choosing Your Project (Proposal & Approval)**

## **4.1 Proposal**

**Submit a one-page proposal by the end of Week 1 and get instructor approval before you invest heavily in the build.** The proposal must cover:

1. **Problem & user:** who is the user, what workflow does the application support, and what pain does it remove?

2. **Why Generative AI:** why does this need an LLM rather than rules or classic software?

3. **Agentic functions:** which of tools / RAG / planning / memory you will implement.

4. **Data:** the documents, datasets, or APIs the application will use, and how you will obtain them.

5. **Stack & deployment target:** planned frameworks, model provider, and where it will be hosted.

6. **Evaluation plan:** what you will measure and how (see Section 5, R3).

7. **Risks & guardrails:** known failure modes, unsafe requests you must refuse, and sensitive data you must protect.

## **4.2 The Off-the-Shelf Test**

**If your idea can be fully served out of the box by ChatGPT, Claude, or a Deep Research feature, pick another application (or a sharper angle on it).** Your project should add value through your data, your tools, your domain constraints, or your workflow integration — something a generic chat product does not already do.

## **4.3 Example Project Ideas**

These examples are illustrative — you are encouraged to bring your own domain. Note how the evaluation follows from the design: if your application uses RAG, a RAG evaluation is required.

| Project idea | Typical agentic functions | Evaluation focus |
| :---- | :---- | :---- |
| Domain knowledge chatbot with RAG (e.g., HR-policy or product-docs assistant) | Retrieval over your document set, citations, “I don’t know” fallback | RAG metrics (faithfulness, answer relevancy, context precision/recall) on a golden test set |
| Research assistant | Web search \+ arXiv tools, multi-step planning, synthesis with sources | Task completion rate, tool-selection accuracy; RAG metrics where retrieval is used |
| Customer support resolution agent | KB retrieval, order/status lookup tool (mock data), refusal & escalation logic | RAG metrics \+ refusal/escalation test suite |
| Document intake & summarisation pipeline | Extraction tools, structured outputs with validation, human-review flags | Field-level accuracy against gold labels; summary quality via LLM-as-judge |
| Meeting / sales prep copilot | Calendar & CRM-style mock tools, conversational memory, brief generation | Task success on scripted scenarios; LLM-as-judge with human spot-checks |
| Data analysis copilot | Sandboxed code-execution tool, chart generation, iterative reasoning | Accuracy on known-answer analytical questions |

# **5\. Core Requirements**

**All three core requirements are mandatory.** They form the bulk of the grade (see rubric).

## **R1 — A Working Generative AI Application (Agentic Preferred)**

* A working application with a usable interface: a web UI (Streamlit, Gradio, Next.js, etc.) or a documented API with a minimal client.

* An LLM at the core of the functionality, integrated cleanly into the application flow (not a single hard-coded API call).

* At least one agentic capability (Section 3); more sophisticated agentic behaviour scores higher.

* **Deliberate prompt design:** compare 2–3 prompt variants on the same test inputs and record what improved or worsened before selecting your default.

* Graceful degradation: the app must handle malformed input, tool failures, and missing knowledge without crashing or hallucinating confidently.

## **R2 — Preferably, Deployed on a Server**

* **The application must run on a server and be functional at a public URL** — not only on your laptop. Acceptable targets include a cloud VM (AWS EC2, GCP Compute Engine, Azure), a PaaS (Render, Railway, Fly.io, Vercel), Hugging Face Spaces, or Streamlit Community Cloud. Free tiers are fine.

* **Confidentiality:** if your data or use case requires restricted access, you can keep it private and submit only video demo.

* Containerisation (Docker) is encouraged and rewarded, but not mandatory.

* **Secrets hygiene:** API keys must be provided via environment variables or the platform’s secret store — never hard-coded, committed, or visible in screenshots. Include a .env.example file.

* Basic operational readiness: request/response logging, latency capture, and error handling. Keep logs free of PII and secrets.

* **Keep the application live through the grading window.** Also include screenshots and logs in your report as backup evidence in case of platform outages.

## **R3 — Evaluation (Required Where Applicable)**

**Every project must state and execute an evaluation plan matched to its design.** “It seems to work” is not evidence. Requirements by application type:

* **If your application uses RAG (most projects): evaluation is mandatory.** Build a golden test set of at least 20 questions with reference answers over your document set (synthetic generation is acceptable if reviewed). Run a standard RAG evaluation — RAGAS or DeepEval — reporting metrics such as faithfulness, answer relevancy, context precision, and context recall.

* **If your application is agentic with tools:** evaluate tool-selection accuracy and task completion rate on at least 15 scripted test scenarios, including scenarios designed to fail (wrong tool available, tool error, missing information).

* **LLM-as-judge** is acceptable for response quality, provided you document the judging prompt and spot-check a sample by hand.

* **Iterate with evidence:** report baseline metrics, make at least one targeted improvement (e.g., better chunking, an advanced retriever, a prompt change), and show the metrics before and after.

* **Instrument with a monitoring tool:** run your evaluation with tracing enabled (e.g., LangSmith or Langfuse) so each test question’s retrieval, tool calls, latency, and output are inspectable. Screenshots of traces are strong evidence.

* **Debug one failure:** include at least one debugged failure case with a root-cause analysis (use your traces), the fix, and before/after proof.

* **If you believe formal evaluation is not applicable** (rare — e.g., a purely creative generator), justify why in your proposal and agree an alternative with your instructor: at minimum a structured manual test plan with recorded results.

# **6\. Guardrails & Caching**

They are how real deployments differ from demos — attempt them once your core requirements work end-to-end.

## **6.1 Guardrails**

Implement and demonstrate protective layers around the LLM:

* **Input guardrails:** prompt-injection detection, off-topic/unsafe request filtering, PII detection and masking before the LLM or logs see it.

* **Output guardrails:** moderation of generated content, grounding/citation checks, structured-output validation, and a clear refusal policy with escalation to a human.

* **Evidence required:** a demonstrated blocked attack or unsafe request (e.g., “ignore your instructions and…”) with logs showing the guardrail firing — not just a description.

*Suggested tooling: Guardrails AI, NVIDIA NeMo Guardrails, provider moderation endpoints, or well-tested custom validators.*

## **6.2 Caching**

Implement caching to reduce latency and cost, and measure the effect:

* **Response caching:** exact-match and/or semantic caching of LLM responses (Redis, GPTCache, LangChain caches, or your own).

* **Embedding caching:** avoid re-embedding unchanged documents and repeated queries.

* **Evidence required:** a before/after table of latency (and estimated cost) for repeated and similar queries, plus your cache-invalidation policy.

# **7\. Advanced Option: Fine-Tuning (Additional Points)**

**Fine-tuning is the advanced extension of this capstone.** Attempt it only after the core requirements are complete — an excellent application without fine-tuning beats a broken one with it.

* **Acceptable approaches:** a provider fine-tuning API (e.g., OpenAI fine-tuning) or parameter-efficient fine-tuning (LoRA/QLoRA via Hugging Face PEFT or Unsloth) of a small open-weights model (e.g., Llama, Mistral, Qwen).

* **Justify the need:** explain why prompting and retrieval alone are insufficient for your use case (style consistency, structured output reliability, domain terminology, latency/cost via a smaller model, etc.).

* **Dataset:** describe how you built your training set (typically 100+ examples), its source, and how you split train/validation data.

* **Evaluate before vs after:** compare the base model and the fine-tuned model on the same test set used in R3, with a results table.

* **Integrate:** wire the fine-tuned model into the deployed application (or document precisely why it is not integrated, e.g., hosting cost).

# **8\. Suggested Reference Stack (Free Choice)**

**You may use any framework, model, or platform — including none.** If you skip a framework, justify your architecture and show equivalent capabilities. The stack below is a known-good default; every component may be swapped with a stated reason.

| Component | Suggested | Common alternatives |
| :---- | :---- | :---- |
| LLM | GPT-4.x / GPT-4-mini class via API | Claude, Gemini, open-weights (Llama, Mistral, Qwen) via Ollama/vLLM |
| Embeddings | text-embedding-3-small | BGE, E5, GTE (open-source) |
| Orchestration | LangChain / LangGraph | CrewAI, LlamaIndex, Flowise, or framework-free with justification |
| Vector store | Qdrant or Chroma | FAISS, pgvector, Pinecone, Weaviate |
| API / serving | FastAPI | Flask, Node/Express |
| User interface | Streamlit or Gradio | Next.js / React, Chainlit |
| Monitoring & tracing | LangSmith or Langfuse | OpenTelemetry, custom structured logging |
| Evaluation | RAGAS | DeepEval, promptfoo, custom harness |
| Caching (bonus) | Redis / GPTCache | LangChain cache, custom semantic cache |
| Guardrails (bonus) | Guardrails AI / NeMo Guardrails | Provider moderation APIs, custom validators |
| Deployment | Render / Railway / Hugging Face Spaces | Fly.io, Vercel, cloud VM \+ Docker, Streamlit Community Cloud |
| Fine-tuning (advanced) | OpenAI fine-tuning API | LoRA/QLoRA with HF PEFT or Unsloth |

# **10\. Deliverables & Submission**

**Your submission has two parts — a demo video and a working URL —** plus your GitHub repository so graders can verify the build, the evaluation, and any bonus features.

## **Part 1 — Demo Video (Maximum 5 Minutes)**

The video is your report: it must explain the project, not just show it. Cover, in order:

1. **The problem** — who the user is, the workflow you support, and the pain you remove.

2. **Your solution** — what you built, and which agentic functions it uses.

3. **Architecture** — components, data flow, and the key design decisions (show your diagram).

4. **Evaluation results** — your metrics, and what improved after your iteration.

5. **Demo walkthrough** — the live application: the core user flow, one safety/guardrail behaviour, and one gracefully handled failure.

**Stay within the 5-minute limit — content beyond it may not be reviewed.** A live demo session may complement, but not replace, the video.

## **Part 2 — Working URL**

* **The application must be functional on a public URL** and stay live through the grading window.

* **If access must be protected for confidentiality,  Just say so 🙂**

## **Verification — GitHub Repository**

Because the written report is delivered through the video, your repository must carry the written evidence:

* **Full source** with a README (setup and run instructions), an architecture diagram, and a .env.example — no API keys anywhere in the repo or its history.

* **Evidence docs** (README or a docs/ folder): prompt comparison table; evaluation method and results tables; the debugged failure case (root cause, fix, before/after); guardrails, caching, and fine-tuning evidence if attempted.

* **Limitations and next steps** — stated honestly.

Submit the video (file or link), the application URL (plus password if protected), and the repository link per the LMS instructions, or package everything as **Capstone\_Project\_\[Your Name\].zip**. Evidence matters more than narrative: logs, screenshots, and tables beat descriptions.

## **Minimum Bar Checklist**

* Working application with an LLM core and at least one agentic capability;

* Deployed on a server, with secrets handled safely;

* Evaluation with a test set and metrics table (or an approved alternative), including one improvement iteration;

* One debugged failure case with root cause, fix, and before/after proof;

* GitHub repository with a reproducible README and the evidence docs;

* Demo video (max 5 minutes) covering all five required sections;

* Working public URL (password provided if access is protected).

## **Security Warning**

**Keep your API keys private.** Do not paste them into screenshots, chats, notebooks, or public repositories. Use environment variables or secure key fields. If you suspect a key has been exposed, rotate it immediately.

# **11\. Grading Overview**

The full rubric, with criteria and performance levels, is in the accompanying Grading Rubric document. Weights:

| Category | Weight |
| :---- | :---- |
| 1\. Problem Framing & Proposal | 10% |
| 2\. Application Quality & LLM Integration | 20% |
| 3\. Agentic Capabilities or Advanced RAG | 15% |
| 4\. Deployment & Operations (Guardrails \+ Caching) | 15% |
| 5\. Evaluation & Iteration | 20% |
| 6\. Code Quality & Documentation | 10% |
| 7\. Demo Video & Evidence | 10% |
| **Base total** | **100%** |
| Bonus: Fine-tuning (justified, evaluated, integrated) | up to \+10 |
| **Maximum final score (capped)** | **100%** |

*Bonus points are added to your base score and the final grade is capped at 100%. In practice, bonus features let strong projects absorb points lost elsewhere — and they are exactly the skills employers ask about.*

# **12\. Evaluation Philosophy**

You are evaluated on **engineering judgment, reliability, explainability, safety-first design, and practical usefulness in real workflows** — not on unnecessary complexity or academic novelty. A modest application that is deployed, evaluated, guarded, and clearly justified will outscore an ambitious one that only runs on your laptop.

# **13\. Academic Integrity & AI Assistance**

* You may use AI coding assistants, but you must understand and be able to explain every part of your submission — expect questions during the demo.

* Credit all third-party code, datasets, and documents; respect licences and data-privacy constraints in the data you use.

* Work submitted must be your own individual project for this capstone.