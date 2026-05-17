# Hormonaly — Public API & Integration Reference

> **The AI-native clinical OS for peptide, hormone, and longevity medicine.**

[![Status](https://img.shields.io/badge/status-status.hormonaly.ai-brightgreen)](https://status.hormonaly.ai)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-spec-blue)](https://hormonaly.ai/api/v1/helix/openapi.json)
[![MCP Server](https://img.shields.io/badge/MCP-24%20tools-purple)](#mcp-server--tool-schema)

This repository is the public-facing integration reference for enterprise partners and API integrators. No source code is published here. For clinical access, visit [hormonaly.ai](https://hormonaly.ai).

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Architecture Overview](#architecture-overview)
3. [Partner API Reference](#partner-api-reference)
4. [MCP Server — Tool Schema](#mcp-server--tool-schema)
5. [Authentication](#authentication)
6. [Rate Limits & Quotas](#rate-limits--quotas)
7. [Errors & Status Codes](#errors--status-codes)
8. [Subscription Tiers](#subscription-tiers)
9. [Scribe API](#scribe-api)
10. [Security & Compliance](#security--compliance)
11. [Getting Access](#getting-access)

---

## Platform Overview

Hormonaly combines three pillars into one platform:

- **Evidence Synthesis** — Multi-agent RAG over PubMed + 594 curated protocols with GRADE-style grading (A–D). 6 biomedical databases queried per response: PubMed, ClinicalTrials.gov, Cochrane, Europe PMC, OpenAlex, Semantic Scholar.
- **Clinical Decision Support** — Real-time answers, SOAP/DAP/Narrative notes, interaction checks, dosing, and monitoring plans grounded in verified citations.
- **Workflow Tools** — The operating layer for clinics, compounding pharmacies, and research teams in the peptide/hormone/longevity space.

**By the numbers:**

| Metric | Value |
|---|---|
| Protocols | 594+ across 31 clinical categories |
| Studies indexed | 10,000+ |
| AI agents | 40+ specialist + background agents |
| Design partner clinics | 18 |
| Clinicians trained | 1,000+ |
| Countries | 5 |
| Quality pipeline checks | 13 per response |
| Citation verification | PubMed PMID-validated, 4s timeout |

**Core products available via API:**

| Product | Description |
|---|---|
| **Helix** | Clinical intelligence engine — multi-agent RAG, GRADE-scored answers, streaming SSE |
| **Scribe** | SOAP/DAP/Narrative clinical note generator with citation grounding |
| **PharmacyOS** | Compounding-pharmacy intelligence — protocols, interactions, Rx generation |
| **Workspace** | Full multi-panel clinical suite — enterprise/partner access |
| **MCP Server** | `@hormonaly/mcp-server` — 24 tools for Claude Desktop and agent frameworks |

---

## Architecture Overview

Hormonaly is built on a **42-agent orchestration architecture** organized into six categories: Evidence, Research, Clinical, Content, Copilot, and Extraction — plus five continuously-running background agents.

### Query Pipeline

Every Helix API call flows through the same deterministic pipeline:

```
Client query
    │
    ▼
NeMo Guardrails (PII redaction · off-topic filter)
    │
    ▼
Agent Router (intent classification → tier selection)
    │
    ├── TIER_1_BEST:     Claude Sonnet 4.6  (complex/clinical queries)
    ├── TIER_2_BALANCED: Claude Sonnet 4.6  (Scribe, CDS, Rx)
    └── TIER_3_FAST:     Claude Haiku 4.5   (free tier, Three-Lens scoring)
    │
    ▼
Multi-Database RAG Retrieval (6 databases · 80K token cap)
    │
    ▼
Cross-Encoder Reranker (threshold ≥ 0.35, fallback 0.15)
    │
    ▼
NeMo Parse — Full-text PMC enrichment (top 5 citations)
    │
    ▼
Supervisor/Worker agents (complex multi-compound queries)
    │
    ▼
Quality Gate (13 checks · 70% composite threshold · async)
    │
    ▼
Citation Grounding (PMID verification · 4s timeout per citation)
    │
    ▼
NeMo Output Guardrail (dosing safety scan · ⚠️ inline flags)
    │
    ▼
Streaming SSE response → client
```

### Agent Categories

| Category | Agents | Role |
|---|---|---|
| Evidence Agent | Primary | Searches 6 biomedical databases, grades findings |
| Safety Agent | Primary | Screens interactions, contraindications, risk factors |
| Protocol Agent | Primary | Retrieves compound protocols and monitoring requirements |
| Contradiction Agent | Primary | Surfaces disagreeing studies, reconciles evidence position |
| Clinical Decision Agent | Primary | Synthesizes structured clinical recommendation |
| Quality Gate | Primary | 13 automated checks on every response |
| Background Agents (×5) | Autonomous | Evidence refresh, safety monitoring, knowledge enrichment, protocol audit, stale-check — run continuously |

### Model Routing

| Query Type | Model | Max Tokens | Output |
|---|---|---|---|
| Standard clinical | Claude Sonnet 4.6 | 4,000 | Streaming SSE + evidence grade + citations |
| Complex (3+ compounds / 30+ words) | Claude Sonnet 4.6 | 6,000 | Streaming SSE + extended synthesis |
| Evidence mode | Claude Sonnet 4.6 | 6,000 | Deeper literature synthesis |
| Extended Thinking / Deep Analysis | Claude Sonnet 4.6 (extended) | 16,000 | SSE + collapsible reasoning panel |
| Three-Lens Scoring | Claude Haiku 4.5 | 600 | JSON: Longevity / Health / Performance scores + verdict |
| Multi-agent supervisor/worker | Claude Sonnet 4.6 | 4,000 | SSE + `orchestration_steps[]` |
| Scribe / Rx / Pamphlet | Claude Sonnet 4.6 | 400–4,096 | Structured template (SOAP / DAP / Narrative / Rx) |
| Free-tier (all types) | Claude Haiku 4.5 | Same | Same format; shorter context, reduced RAG chunks |

### Evidence Quality Pipeline

- **Reranker** — Cross-encoder scores every RAG chunk ≥ 0.35 (fallback 0.15 for niche compounds)
- **Token cap** — 80,000 tokens max RAG context passed to LLM
- **Quality gate** — 13 checks across citation validity, answer completeness, clinical coherence, safety flags — composite score ≥ 70% threshold (async, post-hoc)
- **Citation grounding** — Every PMID verified against PubMed with 4s timeout; unverified citations are dropped
- **NeMo Parse** — Full PMC article text fetched for top 5 citations, structured into intro/methods/results, passed as enriched context

---

## Partner API Reference

**Base URL:** `https://hormonaly.ai/api/v1`

**Auth:** `Authorization: Bearer YOUR_API_KEY` on every request.

**Machine-readable OpenAPI spec:** `GET /api/v1/helix/openapi.json`

All endpoint paths below are relative to the base URL.

### Helix Endpoints

#### `POST /helix/query`

Submit a clinical question and receive a full Helix response with evidence grade, citations, and clinical verdict.

**Request:**

```json
{
  "query": "What is the evidence for BPC-157 in tendon repair?",
  "mode": "evidence",
  "stream": true
}
```

**Response (streaming SSE):**

```
data: {"type":"agent_step","step":"classifying intent"}
data: {"type":"agent_step","step":"searching evidence","sources":26}
data: {"type":"agent_step","step":"verifying citations"}
data: {"type":"content","text":"BPC-157 has demonstrated..."}
data: {"type":"metadata","evidence_grade":"C","confidence":62,"verdict":"CONSIDER","citations":5,"sources_consulted":26}
data: {"type":"done"}
```

**Response metadata fields:**

| Field | Type | Description |
|---|---|---|
| `evidence_grade` | `"A"` \| `"B"` \| `"C"` \| `"D"` | GRADE rating — A = strong RCTs, D = expert opinion/preclinical |
| `confidence` | `0–100` | Composite score from GRADE, citation density, human vs preclinical, inter-source agreement |
| `citations` | `number` | Verified PubMed citations included in response |
| `sources_consulted` | `number` | RAG chunks retrieved from evidence database |
| `agent_type` | `string` | Which specialist agent handled the query |
| `verdict` | `"ADOPT"` \| `"CONSIDER"` \| `"WATCH_AND_WAIT"` \| `"AVOID"` \| `"INSUFFICIENT_DATA"` | Three-Lens clinical verdict |
| `usage` | `object` | Current token usage toward monthly budget |

---

#### `GET /helix/protocols/:compound`

Look up evidence-quality-rated protocols for a specific compound.

**Example:** `GET /helix/protocols/bpc-157`

**Response:**

```json
{
  "compound": "bpc-157",
  "evidence_grade": "C",
  "protocols": [
    {
      "indication": "Tendon repair",
      "dose_range": "200–500 mcg/day",
      "route": ["subcutaneous", "intramuscular"],
      "cycle_duration": "4–12 weeks",
      "monitoring": ["liver enzymes at baseline", "symptom review at 4 weeks"]
    }
  ],
  "interactions": [],
  "citations": 5
}
```

---

#### `POST /helix/dossier`

Generate a comprehensive evidence dossier for a compound (async job). **Advanced or Enterprise tier required.**

**Request:**

```json
{ "compound": "semaglutide", "sections": ["mechanism", "efficacy", "safety", "dosing"] }
```

**Response:** `{ "job_id": "dossier_abc123", "status": "queued" }`

Poll with `GET /helix/dossier/:job_id` until `status: "complete"`.

---

#### `POST /helix/compare`

Compare 2–4 protocols head-to-head across evidence grade, safety, dosing, and clinical readiness. **Advanced or Enterprise tier required.**

**Request:**

```json
{ "compounds": ["testosterone-cypionate", "testosterone-enanthate"] }
```

---

#### `GET /helix/health`

Service health check. No authentication required.

```json
{ "status": "ok", "latency_p50_ms": 4200, "citation_coverage": "99%" }
```

---

## MCP Server — Tool Schema

**Package:** `@hormonaly/mcp-server`

The Hormonaly MCP server exposes 24 tools that allow Claude Desktop, Cursor, or any MCP-compatible agent to query the full Helix clinical intelligence stack directly — with no HTTP client code required on your side.

### Installation (Claude Desktop)

The MCP server build artifact is distributed to enterprise partners on request. Once you have the package installed locally, configure Claude Desktop as follows:

```jsonc
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "hormonaly": {
      "command": "node",
      "args": ["/path/to/hormonaly-mcp-server/dist/index.js"],
      "env": {
        "HORMONALY_API_URL": "https://hormonaly.ai",
        "HORMONALY_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

Restart Claude Desktop — tools appear immediately.

**HTTP/SSE mode** (for server-side agents):

```bash
HTTP_PORT=3100 node dist/index.js
# SSE:    GET  http://localhost:3100/sse?sessionId=YOUR_ID
# POST:   POST http://localhost:3100/messages?sessionId=YOUR_ID
# Health: GET  http://localhost:3100/health
```

To request the MCP package, contact [info@hormonaly.ai](mailto:info@hormonaly.ai).

### Full Tool Schema

#### Helix Tools

| Tool | Description | Auth |
|---|---|---|
| `helix_query` | Clinical question → evidence-graded answer with citations and confidence score | API key |
| `helix_compare` | Compare 2–4 compounds head-to-head *(Advanced/Enterprise)* | API key |
| `helix_protocol` | Get all protocols for a compound from the Helix API | API key |
| `helix_dossier_start` | Start an async dossier generation job *(Advanced/Enterprise)* | API key |
| `helix_dossier_status` | Poll dossier job status by `job_id` | API key |
| `helix_deep_analysis` | Extended analysis with full RAG pipeline, Three-Lens scoring, and PMID citation list | API key |
| `run_clinical_workflow` | Full supervisor/worker multi-agent workflow for complex clinical questions | API key |

#### Protocol Tools

| Tool | Description | Auth |
|---|---|---|
| `protocol_search` | Search protocol library by compound, category, or condition | API key |
| `protocol_get` | Get full protocol details by ID or slug | API key |
| `protocol_list_categories` | List all 31+ protocol categories with counts | API key |
| `protocol_get_interactions` | Check interactions between a set of compounds | API key |

#### Evidence Tools

| Tool | Description | Auth |
|---|---|---|
| `evidence_search` | Search PubMed for research on a compound or condition | API key |
| `evidence_get` | Get full evidence record by ID | API key |
| `evidence_grade` | Grade a set of PMID references using GRADE framework — returns A/B/C/D per study with rationale | API key |

#### Compound Tools

| Tool | Description | Auth |
|---|---|---|
| `compound_search` | Search the compound database by name or category | API key |
| `compound_get_interactions` | Get all known interactions for a compound slug | API key |
| `compound_get_dosing` | Get evidence-based dosing ranges, routes, and cycle guidance | API key |

#### User Tools *(session auth required)*

| Tool | Description |
|---|---|
| `user_get_profile` | Get current user's profile |
| `user_get_usage` | Get AI usage stats for current user |
| `user_get_saved_protocols` | Get protocols saved by current user |
| `monitor_protocol_updates` | Check saved protocols for stale evidence (>90 days); returns `review_recommended` flag |

#### Admin Tools *(admin session required)*

| Tool | Description |
|---|---|
| `admin_get_stats` | Get platform-wide statistics |
| `admin_list_users` | List users with optional search and pagination |
| `admin_get_ai_costs` | Get AI cost breakdown by model and endpoint |

### Agentic Workflow Tools

Three tools activate the full multi-agent pipeline:

**`run_clinical_workflow`** — Supervisor/worker pattern. Decomposes complex clinical questions into 3–4 parallel sub-tasks (evidence search, interaction check, protocol lookup, clinical synthesis), dispatches specialist agents, and returns a synthesized report with `orchestration_steps[]` showing each agent's task, result, timing, and confidence. Latency: 30–90 seconds for complex queries.

**`helix_deep_analysis`** — Extended deep analysis using the full RAG pipeline. Returns Three-Lens scoring across three independent clinical lenses (Longevity / Health & Disease / Performance), full PMID citation list, confidence breakdown by section, and overall evidence grade (A–D).

**`monitor_protocol_updates`** — Checks saved protocols against a 90-day staleness threshold. Returns a `review_recommended` flag and last evidence update date per protocol. Use weekly/monthly to stay current with the literature.

### MCP Tool Input Schemas

**`helix_query`**

```json
{
  "name": "helix_query",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query":   { "type": "string", "description": "Clinical question" },
      "mode":    { "type": "string", "enum": ["evidence", "conversational"], "default": "evidence" },
      "api_key": { "type": "string", "description": "Override env API key per-call" }
    },
    "required": ["query"]
  }
}
```

**`protocol_get_interactions`**

```json
{
  "name": "protocol_get_interactions",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compounds": {
        "type": "array",
        "items": { "type": "string" },
        "description": "List of compound slugs to screen (e.g. ['bpc-157', 'tb-500', 'semaglutide'])"
      }
    },
    "required": ["compounds"]
  }
}
```

**`run_clinical_workflow`**

```json
{
  "name": "run_clinical_workflow",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Complex clinical question for multi-agent synthesis" },
      "patient_context": {
        "type": "object",
        "description": "Optional: age, sex, diagnoses, active_protocols, lab_values",
        "properties": {
          "age":              { "type": "number" },
          "sex":              { "type": "string" },
          "diagnoses":        { "type": "array", "items": { "type": "string" } },
          "active_protocols": { "type": "array", "items": { "type": "string" } },
          "lab_values":       { "type": "object" }
        }
      }
    },
    "required": ["query"]
  }
}
```

**`helix_deep_analysis`**

```json
{
  "name": "helix_deep_analysis",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compound": { "type": "string", "description": "Compound slug or name" },
      "lenses": {
        "type": "array",
        "items": { "type": "string", "enum": ["longevity", "health_disease", "performance"] },
        "description": "Which Three-Lens dimensions to score (default: all three)"
      }
    },
    "required": ["compound"]
  }
}
```

---

## Authentication

Hormonaly uses **two independent auth systems** — do not mix them:

### 1. Helix Data API — Bearer Token

All `/api/v1/*` endpoints require:

```
Authorization: Bearer YOUR_API_KEY
```

API keys are SHA-256 hashed before storage. **The plaintext key is shown exactly once at creation** — store it immediately in your secrets manager. If lost, revoke and rotate; there is no recovery path.

Key management: Partner Portal → API Keys (`/partner/api`)

Keys appear in the portal as a masked prefix (e.g. `hk_live_1055...`) for visual reference only.

### 2. Partner Portal — Session Auth

The Partner Portal (`/partner/*`) uses session-based authentication. Log in at `/partner/login` with email + password. A session cookie is set. **This session does not grant access to the data API**, and your Bearer token cannot log you into the portal.

### Key Lifecycle

- **Create** — Full key shown ONCE in modal; copy immediately.
- **Multiple active keys** — Creating a new key does NOT revoke existing keys.
- **Revoke** — Instant. Any request using that key returns `401` immediately.
- **Lost key** — Revoke and create a new key. No plaintext recovery.

---

## Rate Limits & Quotas

Rate limits apply across all `/api/v1/*` endpoints on a **sliding 60-second window** (atomic SQL counter, race-condition safe):

| Plan | Monthly Base | Tokens Included | Rate Limit | Overage Rate | Hard Cap |
|---|---|---|---|---|---|
| **API Starter** | $499 | 5M tokens | 60 req/min | $25 / 1M | 10M tokens (then 429) |
| **API Advanced** | $1,999 | 25M tokens | 150 req/min | $18 / 1M | 75M tokens (then 429) |
| **API Enterprise** | $4,999 | 50M tokens | Custom | $12 / 1M | None (overage billed) |
| Legacy partners (pre-billing) | — | — | 20 req/min | — | — |

**Over-limit response:** `HTTP 429` with `Retry-After` header.

**Hard cap semantics:** Starter and Advanced plans block at their hard cap (returning 429) until the billing period resets. Enterprise has no hard cap — overage is billed at $12/1M tokens.

**Quota alerts:** All plans receive email/webhook alerts at **80%** and **100%** of the included token allowance, so you're never surprised by overage.

**Token overage** costs are automatically computed and reflected in your monthly invoice. Rates above are per 1M tokens beyond the included allowance.

**Current usage** is returned in every `/api/v1/helix/query` response in the `usage` object and is visible in the Partner Portal under Usage & Billing.

**Budget enforcement:** A global $50/day AI spend cap is checked before every call. Calls that would exceed the cap or monthly budget are blocked with `429` before any LLM tokens are consumed.

### Response Latency

| Endpoint | P50 latency |
|---|---|
| `POST /api/v1/helix/query` | 3–12 seconds |
| `POST /api/v1/scribe/generate` | 15–45 seconds |
| `GET /api/v1/helix/protocols/:compound` | < 200ms |
| `run_clinical_workflow` (MCP) | 30–90 seconds |

---

## Errors & Status Codes

All API errors return a JSON body with a stable `error.code` field that integrators should branch on (rather than parsing the human-readable `message`).

**Error response shape:**

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Request rate exceeded. Retry after 23s.",
    "request_id": "req_01HXYZ..."
  }
}
```

| Status | `error.code` | Meaning | Recommended client behavior |
|---|---|---|---|
| `400` | `INVALID_REQUEST` | Malformed JSON, missing required field, or invalid enum value | Fix the request; do not retry as-is |
| `401` | `MISSING_AUTH` | No `Authorization` header | Attach `Authorization: Bearer YOUR_API_KEY` |
| `401` | `INVALID_KEY` | Key not recognized or revoked | Rotate the key via Partner Portal |
| `403` | `TIER_REQUIRED` | Endpoint requires Advanced or Enterprise tier | Upgrade plan or use a permitted endpoint |
| `404` | `NOT_FOUND` | Compound, protocol, or job ID does not exist | Verify identifier |
| `422` | `VALIDATION_FAILED` | Input passed schema parse but failed semantic validation | Inspect `error.message` for the offending field |
| `429` | `RATE_LIMITED` | Per-minute request rate exceeded | Honor the `Retry-After` header before retrying |
| `429` | `BUDGET_EXCEEDED` | Pre-call budget cap (daily or monthly) would be exceeded | Wait for budget window or contact billing |
| `5xx` | `INTERNAL_ERROR` | Unexpected server error | Retry with exponential backoff (max 3 attempts) |
| `503` | `UPSTREAM_TIMEOUT` | A biomedical database or model upstream timed out | Retry after 5–10s; partial results may still be returned |

**Idempotency:** `GET` endpoints are always safe to retry. `POST /helix/query` is safe to retry on `5xx`/`503`. `POST /helix/dossier` is **not** idempotent — duplicate calls may create duplicate jobs; check `helix_dossier_status` before retrying.

---

## Subscription Tiers

All plans include access to `/query`, `/protocols`, `/status`, `/openapi.json`, `/scribe/generate`, and `/scribe/health`. Higher tiers unlock additional endpoints, higher volume, and reduced overage rates.

### Token Budget & Pricing

| | API Starter | API Advanced | API Enterprise |
|---|---|---|---|
| **Monthly base** | $499 | $1,999 | $4,999 |
| **Tokens included / month** | 5,000,000 | 25,000,000 | 50,000,000 |
| **Overage rate** | $25 / 1M tokens | $18 / 1M tokens | $12 / 1M tokens |
| **Hard cap** | 10M tokens — then 429 | 75M tokens — then 429 | None (overage billed) |
| **Quota alerts** | 80% + 100% | 80% + 100% | 80% + 100% |
| **Rate limit** | 60 req/min | 150 req/min | Custom |

> **Hard cap semantics:** When a Starter or Advanced partner hits their hard cap, the API returns `429 BUDGET_EXCEEDED` for the remainder of the billing period. The counter resets at the start of the next period. Enterprise partners have no hard cap — usage above 50M tokens is billed at the discounted $12/1M rate.

> Token usage is tracked per billing period (scoped to Stripe's `current_period_start` when a subscription is active, or calendar month as a fallback). Current usage is returned in every `/api/v1/helix/query` response in the `usage` object and in the Partner Portal under **Usage & Billing**.

### Feature Access by Tier

| Feature | API Starter | API Advanced | API Enterprise |
|---|---|---|---|
| `/api/v1/helix/query` | ✅ | ✅ | ✅ |
| `/api/v1/helix/protocols/:compound` | ✅ | ✅ | ✅ |
| `/api/v1/scribe/generate` | ✅ | ✅ | ✅ |
| `/api/v1/helix/dossier` | ❌ 403 | ✅ | ✅ |
| `/api/v1/helix/compare` | ❌ 403 | ✅ | ✅ |
| MCP: `helix_compare` | ❌ | ✅ | ✅ |
| MCP: `helix_dossier_start` | ❌ | ✅ | ✅ |
| Seats | Up to 5 | Up to 25 | Unlimited (per contract) |
| White-label portal | ❌ | ❌ | ✅ |
| BAA (HIPAA) | ❌ | ❌ | ✅ |
| Dedicated support | ❌ | ❌ | ✅ |

Contact [info@hormonaly.ai](mailto:info@hormonaly.ai) or see [hormonaly.ai/pricing](https://hormonaly.ai/pricing) for current plan details.

---

## Scribe API

The Scribe API exposes Hormonaly's clinical note generation engine. Mounted at `/api/v1/scribe`. Available on all plans.

#### `POST /scribe/generate`

Generate a structured clinical note from protocol selections and patient context.

**Request:**

```json
{
  "note_format": "soap",
  "patient_context": {
    "age": 45,
    "sex": "male",
    "diagnoses": ["hypogonadism"],
    "active_protocols": ["testosterone-cypionate"],
    "lab_values": { "total_testosterone": "250 ng/dL", "LH": "1.2 mIU/mL" }
  },
  "visit_notes": "Patient presents for quarterly follow-up. Reports improved energy levels and libido since dose adjustment 8 weeks ago."
}
```

**Supported `note_format` values:** `soap` | `dap` | `narrative` (default: `soap`)

**Response (~15–45 seconds):**

```json
{
  "note": "**SUBJECTIVE**\nPatient is a 45-year-old male...",
  "interaction_alerts": [],
  "monitoring_plan": [
    { "test": "Total testosterone", "interval": "8 weeks", "threshold": "> 800 ng/dL triggers dose review" }
  ],
  "confidence_score": 87,
  "evidence_grade": "B"
}
```

**Scribe Intelligence Features:**

- **Drug Interaction Checking** — Every compound screened against the patient's active protocol list; flagged inline with severity ratings (mild / moderate / severe) and citations.
- **Lab Value Cross-Referencing** — Lab values matched against protocol monitoring requirements; follow-up triggers surfaced automatically.
- **Visit-to-Visit Continuity** — Prior notes carry unresolved flags, track protocol changes over time, highlight lab trends across visits.
- **Confidence Scoring** — 0–100 score assessing clinical narrative depth, protocol evidence, lab values, and visit continuity.

#### `GET /scribe/health`

No authentication required.

---

## Security & Compliance

### Security Controls

| Control | Implementation |
|---|---|
| API key storage | SHA-256 hash only — plaintext never stored |
| Rate limiting | Atomic SQL counter (sliding 60s window, cross-instance safe) |
| Budget enforcement | Pre-call check; 429 before any LLM tokens consumed |
| Session fixation | `regenerate()` on every login |
| IDOR protection | All dossiers and engagement records are ownership-checked |
| Mass assignment | Clean — all inputs validated |
| Search injection | All ILIKE/tsquery parameterized via Drizzle ORM |
| Webhook security | HMAC-SHA256 signature verification (Stripe + Resend); idempotency on all events |
| Path traversal | Boundary whitelist on all file-serving endpoints |
| Auth rate limiting | All auth endpoints independently rate-limited (PG-backed, cross-instance) |
| TLS | TLS 1.3 in transit; AES-256 at rest |
| WAF | Cloud Armor active; scanner traffic blocked |
| CSP / HSTS / CORS | All headers configured; `report-uri` Sentry telemetry active |
| Clinical guardrails | NVIDIA NeMo (input PII redaction, output dosing safety scan) |
| Supply chain | `private: true` in `package.json`; dependency audit clean (Mar 2026) |

### Compliance Posture

- **HIPAA-aligned architecture** — No PHI stored by default; patient data is session-scoped unless the Clients feature is explicitly enabled.
- **BAA available** — Enterprise customers receive a Business Associate Agreement.
- **Encryption** — TLS 1.3 in transit, AES-256 at rest, geographically redundant encrypted backups.
- **Audit logging** — All auth events, API key usage, AI calls, and admin actions written to a tamper-evident audit log.
- **Data residency** — GCC-region and EU residency available on request.
- **Infrastructure** — GCP (us-central1), Cloud Run (autoscaling), Cloud SQL PostgreSQL + pgvector.

**GCP inherits:** SOC 2 Type II, ISO 27001, HIPAA, PCI DSS, 150+ compliance certifications at the infrastructure layer.

### AI Safety

- **NeMo Guardrails** on every query: input PII redaction + off-topic safety filter; output dosing safety scan with inline ⚠️ warnings.
- **PEPTIDE_SAFETY_FOOTER** and **HELIX_REGULATORY_RULES** active on all responses.
- **No model training on user data** — query data is not used to train or fine-tune any model.

**Quality benchmarks (internal, May 2026):**

| Dimension | Score |
|---|---|
| Citation-grounding pass rate | 100% |
| Safety block rate (on flagged inputs) | 96% |
| RAG retrieval pass rate | 99% |
| Citation faithfulness (PMID-verified) | 97% (≤ 3% unverified citations dropped pre-response) |

*Internal benchmarks. Methodology available on request.*

### Uptime

- **Target SLA** — 99.9% monthly uptime for all production API endpoints.
- **P1 incidents** — Acknowledged within 15 minutes, resolved within 4 hours.
- **Status** — [status.hormonaly.ai](https://status.hormonaly.ai)
- **Maintenance** — Announced ≥ 72 hours in advance.

---

## Getting Access

### 1. Request Partner API Access

Contact the Hormonaly team to request a Partner API account:

- **Email:** [info@hormonaly.ai](mailto:info@hormonaly.ai)
- **Enterprise / BD:** [hormonaly.ai/about](https://hormonaly.ai/about)
- **Plans:** [hormonaly.ai/pricing](https://hormonaly.ai/pricing)

You will receive your API key and a cURL quickstart example by email, plus a separate Partner Portal invitation to set up your dashboard at `/partner/dashboard`.

### 2. First API Call

```bash
curl -X POST https://hormonaly.ai/api/v1/helix/query \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the evidence for semaglutide in metabolic optimization?", "stream": false}'
```

### 3. OpenAPI Spec

```bash
curl https://hormonaly.ai/api/v1/helix/openapi.json
```

Feed into `openapi-generator`, Prism, or Postman for auto-generated client libraries and interactive documentation.

### 4. Full Documentation

| Resource | URL |
|---|---|
| API Reference | [hormonaly.ai/api-docs](https://hormonaly.ai/api-docs) |
| Technical Manual | [hormonaly.ai/manual](https://hormonaly.ai/manual) |
| Partner Portal | [hormonaly.ai/partner/login](https://hormonaly.ai/partner/login) |
| Integration Guide | [hormonaly.ai/integration-guide](https://hormonaly.ai/integration-guide) |
| Platform | [hormonaly.ai](https://hormonaly.ai) |
| About / Leadership | [hormonaly.ai/about](https://hormonaly.ai/about) |
| Status | [status.hormonaly.ai](https://status.hormonaly.ai) |

---

## About Hormonaly

Hormonaly was founded by **Fady Hannah-Shmouni, MD FRCPC** — board-certified endocrinologist and geneticist, NIH-trained, Professor at UBC, with 100+ peer-reviewed publications (h-index 27) and two international clinical guidelines co-authored. The platform was built after a decade at the NIH investigating rare endocrine disorders — firsthand evidence that the evidence gap in peptide and hormone medicine was widening faster than clinicians could close it.

**Leadership:** Fady Hannah-Shmouni, MD FRCPC (CEO/CBO/Founder) · Omar Saleem, MD (Director, AI Academy) · Matt D. Kramer (Healthcare Technology Strategist)

**Advisory Board:** Ali Mostashari, PhD (LifeNome) · Constantine Stratakis, MD (ASTREA) · Cory S. Goldberg, MD · John Kozman (Supernatural) · Dominik Thor, MSc (GCLS) · Labib Ghulmiyyah, MD · Zahraa Abdul Sater, MBBS

**Design partner clinics (18):** FORM Face + Body, REBORNE Longevity, Healthspan Digital, PearlMD, Toronto Functional Medicine Centre, A-Life, Astrea Health, Valeo Health, and others.

**Educational partners:** DrVibe.ai (1,000+ clinicians trained across 5 countries) · GCLS.ai (Geneva College of Longevity Science)

---

*Hormonaly is an educational and clinical decision-support platform. All AI output is intended to augment — not replace — the clinical judgment of a licensed healthcare professional. A medical disclaimer is included on every response. For security disclosures, email fady@hormonaly.ai or use GitHub private vulnerability reporting.*

*This repository contains no proprietary source code. © Hormonaly — All rights reserved.*
