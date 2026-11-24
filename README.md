# Hormonaly — Public API & Integration Reference

> **The AI-native infrastructure for peptide, hormone, and longevity medicine.**

[![OpenAPI](https://img.shields.io/badge/OpenAPI-spec-blue)](https://api.hormonaly.ai/openapi.json)
[![MCP Server](https://img.shields.io/badge/MCP-17%20tools-purple)](#mcp-server--tool-schema)
[![Hormonaly-1](https://img.shields.io/badge/Hormonaly--1-Live%20Jun%202026-orange)](#hormonaly-1-llm)

This repository is the public-facing integration reference for enterprise partners and API integrators. The MCP server source is published in this repository at [Hormonaly-ai/hormonaly-public](https://github.com/Hormonaly-ai/hormonaly-public). For clinical access, visit [hormonaly.ai](https://hormonaly.ai).

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
12. [Three-Lens Scoring](#three-lens-scoring)
13. [Webhook Events](#webhook-events)
14. [API Versioning & Stability](#api-versioning--stability)
15. [Hormonaly-1 LLM](#hormonaly-1-llm)
16. [About Hormonaly](#about-hormonaly)

## Platform Overview

Hormonaly combines three pillars into one platform:

- **Evidence Synthesis** — Multi-agent RAG over PubMed + 594 curated protocols with GRADE-style grading (A–D). 6 biomedical databases queried per response: PubMed, ClinicalTrials.gov, Cochrane, Europe PMC, OpenAlex, Semantic Scholar.
- **Clinical Decision Support** — Real-time answers, SOAP/DAP/Narrative notes, interaction checks, dosing, and monitoring plans grounded in verified citations.
- **Workflow Tools** — The operating layer for clinics, compounding pharmacies, and research teams in the peptide/hormone/longevity space.

By the numbers:

| Metric | Value |
|---|---|
| Protocols | 594+ across 31 clinical categories |
| Studies indexed | 10,000+ |
| AI agents | 42 specialist + background agents |
| Design partner clinics | 21 |
| Clinicians trained | 1,000+ |
| Countries | 5 |
| Quality pipeline checks | 13 per response |
| Citation verification | PubMed PMID-validated, 4s timeout |

Core products available via API:

| Product | Description |
|---|---|
| Helix | Clinical intelligence engine — multi-agent RAG, GRADE-scored answers, streaming SSE |
| Scribe | SOAP/DAP/Narrative clinical note generator with citation grounding |
| PharmacyOS | Compounding-pharmacy intelligence — protocols, interactions, Rx generation |
| Workspace | Full multi-panel clinical suite — enterprise/partner access |
| MCP Server | @hormonaly/mcp-server — 17 tools for Claude Desktop and agent frameworks |

## Architecture Overview

Hormonaly is built on a 42-agent orchestration architecture organized into six categories: Evidence, Research, Clinical, Content, Copilot, and Extraction — plus six continuously-running background agents.

### Query Pipeline

Every Helix API call flows through the same deterministic pipeline:

```
Client query
│
▼
NeMo Guardrails (PII redaction · off-topic filter · nvidia/llama-3.1-nemotron-nano-8b-v1)
│
▼
Agent Router (intent classification → tier selection)
│
├── TIER_1_BEST: Claude Sonnet 4.6 → GPT-4o fallback (complex/clinical queries)
├── TIER_2_BALANCED: Claude Sonnet 4.6 → GPT-4o → Claude Haiku 4.5 fallback (Scribe, CDS, Rx)
└── TIER_3_FAST: Claude Haiku 4.5 → GPT-4o Mini → Gemini 2.5 Flash → Claude Sonnet 4.6 fallback (free tier, Three-Lens scoring)
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
NeMo Output Guardrail (dosing safety scan · inline flags)
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
| Background Agents (×6) | Autonomous | Evidence refresh, safety monitoring, knowledge enrichment, protocol audit, stale-check, user-monitor notifications — run continuously |

### Model Routing

| Query Type | Model | Max Tokens | Output |
|---|---|---|---|
| Standard clinical | Claude Sonnet 4.6 | 4,000 | Streaming SSE + evidence grade + citations |
| Complex (3+ compounds / 30+ words) | Claude Sonnet 4.6 | 6,000 | Streaming SSE + extended synthesis |
| Evidence mode | Claude Sonnet 4.6 | 6,000 | Deeper literature synthesis |
| Extended Thinking / Deep Analysis | Claude Sonnet 4.6 (extended) | 16,000 | SSE + collapsible reasoning panel |
| Three-Lens Scoring | Claude Haiku 4.5 | 600 | JSON: Longevity / Health / Performance scores + verdict |
| Multi-agent supervisor/worker | Claude Sonnet 4.6 | 4,000 | SSE + orchestration_steps[] |
| Scribe / Rx / Pamphlet | Claude Sonnet 4.6 | 400–4,096 | Structured template (SOAP / DAP / Narrative / Rx) |
| Free-tier (all types) | Claude Haiku 4.5 | Same | Same format; shorter context, reduced RAG chunks |
| **Hormonaly-1 (self-hosted)** | **Hormonaly-1 on NVIDIA NIM** | **131k ctx** | **Same SSE format; zero third-party dependency at inference** |

> **Model routing note:** All tiers use a primary + fallback chain. TIER_1: Claude Sonnet 4.6 → GPT-4o. TIER_2: Claude Sonnet 4.6 → GPT-4o → Claude Haiku 4.5. TIER_3: Claude Haiku 4.5 → GPT-4o Mini → Gemini 2.5 Flash → Claude Sonnet 4.6. NVIDIA NIM (nvidia/llama-3.3-nemotron-super-49b-v1, self-hosted on 8×H100 SXM) is used for citation grounding and the Ask Hormonaly copilot agent. **Hormonaly-1** is Hormonaly's proprietary fine-tuned model — deployed on the same H100 infrastructure and progressively integrated to reduce third-party API dependence. See [Hormonaly-1 LLM](#hormonaly-1-llm).

### Evidence Quality Pipeline

- **Reranker** — Cross-encoder scores every RAG chunk ≥ 0.35 (fallback 0.15 for niche compounds)
- **Token cap** — 80,000 tokens max RAG context passed to LLM
- **Quality gate** — 13 checks across citation validity, answer completeness, clinical coherence, safety flags — composite score ≥ 70% threshold (async, post-hoc)
- **Citation grounding** — Every PMID verified against PubMed with 4s timeout; unverified citations are dropped
- **NeMo Parse** — Full PMC article text fetched for top 5 citations, structured into intro/methods/results, passed as enriched context

## Partner API Reference

Base URL: `https://api.hormonaly.ai/api/v1`

Call `api.hormonaly.ai` from your servers. `hormonaly.ai` is the website: it sits behind Cloudflare bot protection, which can answer a server-to-server request with a 403 HTML page before it reaches the API.

Auth: `Authorization: Bearer hk_live_...` on every authenticated request.

Machine-readable OpenAPI 3.1 spec: `GET https://api.hormonaly.ai/openapi.json`. The spec and the [API docs](https://hormonaly.ai/api-docs) are the source of truth; this README is a summary.

All endpoint paths below are relative to the base URL. Request bodies are JSON (`Content-Type: application/json`); anything else gets 415.

### Helix Endpoints

#### POST /helix/query

Submit a clinical question and receive an evidence-graded answer with citations.

Request:

```json
{
  "question": "What is the evidence for BPC-157 in tendon repair?",
  "include_citations": true,
  "detail_level": "clinical"
}
```

Main fields: `question` (required, up to 10,000 characters), `language` (`en` or `ar`; when omitted, a question written mostly in Arabic is answered in Arabic), `detail_level` (`clinical` or `summary`), `include_citations`, `include_three_lens`, `verbosity` (`concise` default, or `standard`), `patient_context`, `history`, `partner_formulary` (up to 500 entries) and `on_formulary_only`. See the OpenAPI spec for every field.

Buffered response (abridged):

```json
{
  "success": true,
  "data": {
    "answer": "...",
    "grade": "C",
    "confidence": { "score": 62, "level": "medium", "factors": ["..."] },
    "citations": [ { "id": 1, "pmid": "...", "title": "...", "year": 2021, "evidence_level": "..." } ],
    "related_protocols": [ { "id": "bpc-157-recovery", "title": "...", "grade": "C" } ]
  },
  "usage": { "tokens": 14746, "latency_ms": 25000, "cache": "MISS" }
}
```

- `grade` is the A–D evidence grade (null when the evidence is insufficient).
- `confidence.score` is an integer 0–100; `level` is one of `high`, `medium-high`, `medium`, `low-medium`, `low`.
- A repeated question can be served from cache: `usage.cache` is `"HIT"`, `usage.tokens` is 0 (not billed) and `usage.original_tokens` is the original generation's count.
- `Idempotency-Key` (1–255 characters of letters, digits, `_ - . :`; a UUID works) makes a retry return the original response without re-billing. Reusing a key with a different body returns 422.

Streaming: send `Accept: text/event-stream` (or `"stream": true`). The response uses named SSE events, for example:

```
event: stage
data: {"stage":"classifying"}

event: content
data: {"content":"BPC-157 has demonstrated..."}

event: done
data: {"grade":"C","confidence":{"score":62,"level":"medium"},"citations":[...],"usage":{"tokens":16569}}
```

Other events include `agent`, `sources`, `heartbeat` and `content_replace` (the final text replacing the streamed draft). See the API docs for the full event list.

Typical latency: a buffered clinical answer takes about 20–35 seconds; streaming shows the first text within a few seconds. Set your client timeout to at least 100 seconds for buffered calls, or use streaming or async jobs (`POST /helix/jobs`).

#### GET /helix/protocols/:compound

Look up the protocols for a compound.

Example: `GET /helix/protocols/bpc-157`

Returns the compound's protocols with titles, evidence grades, regulatory status and summaries, plus `protocol_count`. Unknown compounds return 404.

#### POST /helix/dossier

Generate an evidence dossier for a compound (async job). Advanced or Enterprise tier.

Request:

```json
{ "compound": "semaglutide", "language": "en" }
```

Response: `{ "success": true, "data": { "job_id": "dossier_...", "status": "processing", "poll_url": "..." } }`

Poll `GET /helix/dossier/:job_id` until `status` is `completed` (or `failed`). The completed result carries `title`, `executive_summary`, `citations`, `grade` (A–D or null), `recommendation` (the verdict), `confidence` (0–100) and `pdf_url`.

#### POST /helix/compare

Compare 2–3 compounds head-to-head. Advanced or Enterprise tier.

Request:

```json
{ "compounds": ["testosterone-cypionate", "testosterone-enanthate"], "indication": "Hypogonadism" }
```

#### POST /helix/jobs

Run a query (`"type": "query"`) or a scribe note (`"type": "scribe"`) asynchronously. Returns 202 with a `job_id`; poll `GET /helix/jobs/:job_id` until `status` is `done` or `failed`.

```json
{ "type": "query", "payload": { "question": "What is the evidence for metformin in PCOS?" } }
```

#### GET /helix/health

Service health check. No authentication required.

```json
{ "status": "ok" }
```

---

## MCP Server — Tool Schema

Package: `@hormonaly/mcp-server`

The Hormonaly MCP server exposes 17 tools that allow Claude Desktop, Cursor, or any MCP-compatible agent to query the full Helix clinical intelligence stack directly — with no HTTP client code required on your side.

### Installation (Claude Desktop)

The MCP server source is available in our GitHub repository. Clone and build locally:

```bash
git clone https://github.com/Hormonaly-ai/hormonaly-public.git
cd hormonaly-public/mcp/hormonaly-mcp-server
npm install && npm run build
```

Then configure Claude Desktop as follows:

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "hormonaly": {
      "command": "node",
      "args": ["/path/to/hormonaly-mcp-server/dist/index.js"],
      "env": {
        "HORMONALY_API_URL": "https://api.hormonaly.ai",
        "HORMONALY_API_KEY": "hk_live_YOUR_PARTNER_API_KEY"
      }
    }
  }
}
```

Restart Claude Desktop — tools appear immediately.

HTTP/SSE mode (for server-side agents). Every request must carry the caller's own partner key as `x-api-key: hk_…` (or `Authorization: Bearer hk_…`); a key in the server's environment is never used remotely:

```bash
HTTP_PORT=3100 node dist/index.js
# Streamable HTTP: POST http://localhost:3100/mcp        (x-api-key required)
# SSE (legacy):    GET  http://localhost:3100/sse        (x-api-key required)
#                  POST http://localhost:3100/messages   (same key as the /sse connection)
# Health:          GET  http://localhost:3100/health
```

See the `mcp/README.md` for full setup instructions.

### Remote MCP — Claude.ai One-Click Connect

Live · Published May 2026 · Registry: registry.modelcontextprotocol.io

The Hormonaly MCP server is deployed as a remote HTTP/SSE server and listed on the official MCP Registry as `io.github.Hormonaly-ai/hormonaly`. Enterprise customers using Claude.ai get a one-click Connect experience — no local installation, no Docker, no `claude_desktop_config.json` edits required.

| Property | Value |
|---|---|
| SSE endpoint | https://mcp.hormonaly.ai/sse |
| Registry ID | io.github.Hormonaly-ai/hormonaly |
| Auth header | x-api-key: hk_live_... (Partner API key) |
| Infrastructure | GCP Cloud Run · Cloudflare DNS · TLS provisioned by GCP |

**One-Click Connect Flow (Claude.ai Enterprise)**

1. Claude.ai discovers Hormonaly via the MCP Registry — no manual URL entry needed
2. User clicks Connect — Claude prompts: "Enter your x-api-key"
3. User pastes their `hk_live_...` Partner API key (generated in the Partner Portal → API Keys)
4. All 17 tools activate immediately in the conversation

### Authentication & Access Tiers

| Tool group | Auth required | Examples |
|---|---|---|
| Protocol, Evidence, Compound tools (9 tools) | None — public read access over stdio | protocol_search, compound_get_dosing |
| Helix & agentic tools, plus evidence_grade (8 tools) | Partner API key | helix_query, run_clinical_workflow, helix_deep_analysis, evidence_grade |

The MCP server authenticates with a partner API key only; there are no session-cookie or admin tools. Partner API keys start with `hk_live_` (`hk_test_` for sandbox) and are generated in the Partner Portal. Over the remote HTTP/SSE transports every request needs the key in the `x-api-key` header, public tools included — Claude.ai will prompt for it on first connect.

### Full Tool Schema

#### Helix Tools

| Tool | Description | Auth |
|---|---|---|
| helix_query | Clinical question → evidence-graded answer with citations and confidence score | API key |
| helix_compare | Compare 2–3 compounds head-to-head (Advanced/Enterprise) | API key |
| helix_protocol | Get all protocols for a compound from the Helix API | API key |
| helix_dossier_start | Start an async dossier generation job (Advanced/Enterprise) | API key |
| helix_dossier_status | Poll dossier job status by job_id | API key |
| helix_deep_analysis | Extended analysis with full RAG pipeline, Three-Lens scoring, and PMID citation list | API key |
| run_clinical_workflow | Full supervisor/worker multi-agent workflow for complex clinical questions | API key |

#### Protocol Tools

| Tool | Description | Auth |
|---|---|---|
| protocol_search | Search protocol library by compound, category, or condition | Public (no auth) |
| protocol_get | Get full protocol details by ID or slug | Public (no auth) |
| protocol_list_categories | List all 31+ protocol categories with counts | Public (no auth) |
| protocol_get_interactions | Check interactions between a set of compounds | Public (no auth) |

#### Evidence Tools

| Tool | Description | Auth |
|---|---|---|
| evidence_search | Search PubMed for research on a compound or condition | Public (no auth) |
| evidence_get | Get full evidence record by ID | Public (no auth) |
| evidence_grade | Grade a set of PMID references using GRADE framework — returns A/B/C/D per study with rationale | API key |

#### Compound Tools

| Tool | Description | Auth |
|---|---|---|
| compound_search | Search the compound database by name or category | Public (no auth) |
| compound_get_interactions | Get all known interactions for a compound slug | Public (no auth) |
| compound_get_dosing | Get evidence-based dosing ranges, routes, and cycle guidance | Public (no auth) |

#### Agentic Workflow Tools

Two tools activate the full multi-agent pipeline:

**run_clinical_workflow** — Supervisor/worker pattern. Decomposes complex clinical questions into 3–4 parallel sub-tasks (evidence search, interaction check, protocol lookup, clinical synthesis), dispatches specialist agents, and returns a synthesized report with `orchestration_steps[]` showing each agent's task, result, timing, and confidence. Latency: 30–90 seconds for complex queries.

**helix_deep_analysis** — Extended deep analysis using the full RAG pipeline. Returns Three-Lens scoring across three independent clinical lenses (Longevity / Health & Disease / Performance), full PMID citation list, confidence breakdown by section, and overall evidence grade (A–D).

### MCP Tool Input Schemas

All 17 tool schemas. The `inputSchema` block is what Claude Desktop and MCP clients use to validate parameters before sending.

#### helix_query

```json
{
  "name": "helix_query",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string", "description": "Clinical question", "maxLength": 10000 },
      "language": { "type": "string", "enum": ["en","ar"], "default": "en" },
      "detail_level": { "type": "string", "enum": ["clinical","summary"], "default": "clinical" },
      "include_citations":{ "type": "boolean", "default": true },
      "include_three_lens":{ "type": "boolean", "default": false },
      "api_key": { "type": "string", "description": "Override env API key" }
    },
    "required": ["question"]
  }
}
```

#### helix_compare (Advanced/Enterprise)

```json
{
  "name": "helix_compare",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compounds": { "type": "array", "items": { "type": "string" }, "minItems": 2, "maxItems": 3 },
      "indication": { "type": "string", "default": "General comparison" },
      "language": { "type": "string", "enum": ["en","ar"], "default": "en" },
      "api_key": { "type": "string" }
    },
    "required": ["compounds"]
  }
}
```

#### helix_protocol

```json
{
  "name": "helix_protocol",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compound": { "type": "string", "maxLength": 200 },
      "language": { "type": "string", "enum": ["en","ar"], "default": "en" },
      "api_key": { "type": "string" }
    },
    "required": ["compound"]
  }
}
```

#### helix_dossier_start (Advanced/Enterprise)

```json
{
  "name": "helix_dossier_start",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compound": { "type": "string", "maxLength": 500 },
      "language": { "type": "string", "enum": ["en","ar"], "default": "en" },
      "api_key": { "type": "string" }
    },
    "required": ["compound"]
  }
}
```

#### helix_dossier_status

```json
{
  "name": "helix_dossier_status",
  "inputSchema": {
    "type": "object",
    "properties": {
      "job_id": { "type": "string" },
      "api_key": { "type": "string" }
    },
    "required": ["job_id"]
  }
}
```

#### helix_deep_analysis

```json
{
  "name": "helix_deep_analysis",
  "inputSchema": {
    "type": "object",
    "properties": {
      "topic": { "type": "string", "description": "Clinical topic for deep analysis", "maxLength": 10000 },
      "language": { "type": "string", "enum": ["en","ar"], "default": "en" },
      "api_key": { "type": "string" }
    },
    "required": ["topic"]
  }
}
```

#### run_clinical_workflow

```json
{
  "name": "run_clinical_workflow",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string", "description": "Complex clinical question", "maxLength": 10000 },
      "patient_context": { "type": "string", "description": "Optional: age, sex, conditions, medications" },
      "language": { "type": "string", "enum": ["en","ar"], "default": "en" },
      "api_key": { "type": "string" }
    },
    "required": ["question"]
  }
}
```

#### protocol_search

```json
{
  "name": "protocol_search",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "category": { "type": "string", "description": "e.g. 'weight-loss', 'hormones'" },
      "limit": { "type": "number", "default": 10 }
    },
    "required": ["query"]
  }
}
```

#### protocol_get

```json
{
  "name": "protocol_get",
  "inputSchema": {
    "type": "object",
    "properties": { "id": { "type": "string" } },
    "required": ["id"]
  }
}
```

#### protocol_list_categories

```json
{
  "name": "protocol_list_categories",
  "inputSchema": { "type": "object", "properties": {} }
}
```

#### protocol_get_interactions

```json
{
  "name": "protocol_get_interactions",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compounds": { "type": "array", "items": { "type": "string" }, "minItems": 2,
      "description": "Compound slugs to screen" }
    },
    "required": ["compounds"]
  }
}
```

#### evidence_search

```json
{
  "name": "evidence_search",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compound": { "type": "string" },
      "max_results": { "type": "number", "default": 10 }
    },
    "required": ["compound"]
  }
}
```

#### evidence_get

```json
{
  "name": "evidence_get",
  "inputSchema": {
    "type": "object",
    "properties": { "id": { "type": "string" } },
    "required": ["id"]
  }
}
```

#### evidence_grade

```json
{
  "name": "evidence_grade",
  "inputSchema": {
    "type": "object",
    "properties": {
      "ids": { "type": "array", "items": { "type": "string" }, "minItems": 1, "maxItems": 20,
      "description": "Evidence record IDs to GRADE-score" },
      "api_key": { "type": "string", "description": "Helix API key" }
    },
    "required": ["ids"]
  }
}
```

#### compound_search

```json
{
  "name": "compound_search",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "category": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

#### compound_get_interactions

```json
{
  "name": "compound_get_interactions",
  "inputSchema": {
    "type": "object",
    "properties": { "slug": { "type": "string", "description": "e.g. 'semaglutide'" } },
    "required": ["slug"]
  }
}
```

#### compound_get_dosing

```json
{
  "name": "compound_get_dosing",
  "inputSchema": {
    "type": "object",
    "properties": { "slug": { "type": "string", "description": "e.g. 'testosterone-cypionate'" } },
    "required": ["slug"]
  }
}
```

## Authentication

Hormonaly uses two independent auth systems — do not mix them:

### 1. Helix Data API — Bearer Token

All authenticated `/api/v1/*` endpoints require: `Authorization: Bearer hk_live_...`

API keys are generated in the Partner Portal (API & Usage → API Keys, `/partner/api`). Live keys start with `hk_live_`, sandbox keys with `hk_test_`. Keys are SHA-256 hashed before storage. The plaintext key is shown exactly once, when it is generated — store it immediately in your secrets manager. If lost, revoke and generate a new one; there is no recovery path. REST `/api/v1/*` endpoints expect the key in the `Authorization: Bearer` header; the remote MCP server expects it in the `x-api-key: hk_live_...` header.

### 2. Partner Portal — Session Auth

The Partner Portal (`/partner/*`) uses session-based authentication. Log in at `/partner/login` with email + password. This session does not grant access to the data API.

### Key Lifecycle

1. **Generate** — In the Partner Portal. The full key is shown ONCE; copy it immediately.
2. **Multiple active keys** — Creating a new key does NOT revoke existing keys.
3. **Revoke** — Instant. Any request using that key returns 401 immediately.
4. **Lost key** — Revoke it and generate a new key in the Partner Portal. No plaintext recovery.

## Rate Limits & Quotas

| Plan | Monthly Base | Tokens Included | Rate Limit | Overage Rate | Hard Cap |
|---|---|---|---|---|---|
| API Starter | $499 | 5M tokens | Per partner (default 60 req/min) | $100 / 1M | 10M tokens (then 429) |
| API Advanced | $1,999 | 25M tokens | Per partner (default 60 req/min) | $80 / 1M | 75M tokens (then 429) |
| API Enterprise | $4,999 | 75M tokens | Per partner (default 60 req/min) | $25 / 1M | None (overage billed) |

Rate limits are **per partner** (all of a partner's keys share one limit), **default 60 requests per minute**, counted in a **fixed** 60-second window. Your account's limit is returned on every authenticated response in `X-RateLimit-Limit`, with `X-RateLimit-Remaining` and `X-RateLimit-Reset` (Unix seconds). Over the limit: HTTP 429 `rate_limit_exceeded` with a `Retry-After` header. The monthly token cap is the tighter of your account's cap and the plan's hard cap; past it, live keys get 429 `monthly_budget_exceeded` until the 1st.

### Response Latency

| Endpoint | P50 latency |
|---|---|
| POST /api/v1/helix/query | 20–35 seconds buffered (clinical); first streamed text within a few seconds |
| POST /api/v1/scribe/generate | 15–45 seconds |
| GET /api/v1/helix/protocols/:compound | < 200ms |
| run_clinical_workflow (MCP) | 30–90 seconds |

### usage Object

Every `POST /api/v1/helix/query` response includes a `usage` object for that request:

```json
{
  "usage": {
    "tokens": 14746,
    "latency_ms": 25000,
    "cache": "MISS"
  }
}
```

- `tokens` — tokens billed for this request. 0 for a cache hit (`"cache": "HIT"`) and for a refused request.
- `original_tokens` — cache hits only: tokens the original generation used (not billed again).
- `latency_ms` — server-side latency.

Month-to-date totals: `GET /api/v1/helix/usage`.

## Errors & Status Codes

Errors use the standard envelope with a lowercase, machine-readable `error` code:

```json
{
  "success": false,
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Maximum 60 requests per minute. Retry after 12 seconds."
}
```

Authentication, budget and rate-limit rejections from the middleware carry `error` and `message` without the `success` key. Some errors add fields such as `retryAfter`, `budget` and `used`.

| Status | error | Meaning | Recommended client behavior |
|---|---|---|---|
| 400 | validation_error | Malformed request or missing/invalid field | Fix the request; do not retry as-is |
| 400 | invalid_idempotency_key | `Idempotency-Key` not 1–255 characters of letters, digits, `_ - . :` | Send a valid key (a UUID works); nothing was processed or billed |
| 400 | prompt_injection | Instruction-like or role-changing text in a free-text field | Remove it and retry |
| 401 | authentication_required | No `Authorization` header | Send `Authorization: Bearer hk_live_...` |
| 401 | invalid_api_key | Key not recognized or revoked | Generate a new key in the Partner Portal |
| 403 | tier_insufficient | Endpoint requires the Advanced or Enterprise tier | Upgrade plan |
| 403 | endpoint_not_allowed | Path not in your account's allowed endpoints | Contact sales |
| 403 | partner_not_active / subscription_canceled | Account pending, suspended, or subscription canceled | Contact info@hormonaly.ai |
| 404 | not_found / job_not_found | Compound, protocol, or job ID does not exist | Verify identifier |
| 409 | idempotency_key_in_flight | A request with this key is still running | Retry after `Retry-After` with the same body |
| 413 | payload_too_large | Body over 5 MB | Send a smaller body |
| 415 | unsupported_media_type | Body is not `application/json` | Set `Content-Type: application/json` |
| 422 | idempotency_key_reuse_mismatch | Key already used with a different body | Use a fresh key, or resend the original body |
| 429 | rate_limit_exceeded | Per-minute request rate exceeded | Honor the `Retry-After` header |
| 429 | monthly_budget_exceeded | Monthly token cap reached | Wait for the 1st or contact billing |
| 500 | internal_error | Unexpected server error | Retry with exponential backoff (max 3 attempts) |
| 503 | service_overloaded / service_unavailable | AI service busy or unavailable | Retry with exponential backoff |
| 504 | gateway_timeout / timeout | The answer did not finish in time | Retry, or use streaming or `POST /helix/jobs` |

The OpenAPI spec lists the codes each endpoint can return.

## Subscription Tiers

Three tiers: **API Starter**, **API Advanced** and **API Enterprise** (tier keys `starter`, `professional` and `enterprise`; `professional` is sold as API Advanced). Only dossier and compare are tier-gated; tiers otherwise govern volume.

| | API Starter | API Advanced | API Enterprise |
|---|---|---|---|
| Monthly base | $499 | $1,999 | $4,999 |
| Tokens included / month | 5,000,000 | 25,000,000 | 75,000,000 |
| Overage rate | $100 / 1M tokens | $80 / 1M tokens | $25 / 1M tokens |
| Hard cap | 10M tokens — then 429 | 75M tokens — then 429 | None (overage billed) |
| Rate limit | Per partner, default 60 req/min | Per partner, default 60 req/min | Per partner, default 60 req/min |

| Feature | API Starter | API Advanced | API Enterprise |
|---|---|---|---|
| /api/v1/helix/query | Yes | Yes | Yes |
| /api/v1/scribe/generate | Yes | Yes | Yes |
| /api/v1/helix/dossier | No — 403 | Yes | Yes |
| /api/v1/helix/compare | No — 403 | Yes | Yes |
| White-label portal | No | No | Yes |
| BAA (HIPAA) | No | No | Yes |
| Dedicated support | No | No | Yes |

## Scribe API

Mounted at `/api/v1/scribe`. Available on all plans.

### POST /scribe/generate

```bash
curl -X POST https://api.hormonaly.ai/api/v1/scribe/generate \
  -H "Authorization: Bearer hk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "protocols": [
      { "name": "Testosterone Cypionate", "dose": "200 mg", "frequency": "weekly", "route": "IM" },
      { "name": "Anastrozole", "dose": "0.5 mg", "frequency": "twice weekly", "route": "oral" }
    ],
    "clinical_context": "42M presenting for TRT follow-up. Reports improved energy and libido.",
    "note_format": "soap",
    "language": "en",
    "lab_values": [
      { "name": "Total Testosterone", "value": "850", "unit": "ng/dL" },
      { "name": "Estradiol", "value": "32", "unit": "pg/mL" }
    ]
  }'
```

- `protocols` (required, 1–12 items, each with `name` and optional `compound`, `dose`, `frequency`, `route`, `duration`).
- `clinical_context` (up to 10,000 characters), `lab_values`, `previous_note_context`.
- `note_format`: `soap | dap | narrative` (default `soap`); `language`: `en | ar` (default `en`).
- `stream: true` (or `Accept: text/event-stream`) returns SSE: `stage` events, one `content` event with the full note, then `done`.

Response (abridged):

```json
{
  "success": true,
  "data": {
    "format": "soap",
    "content": "SUBJECTIVE:\nPatient is a 42-year-old male presenting for TRT follow-up...",
    "sections": { "subjective": "...", "objective": "...", "assessment": "...", "plan": "..." },
    "protocols_summary": "Testosterone Cypionate 200 mg IM weekly, Anastrozole 0.5 mg PO twice weekly",
    "monitoring_plan": "Repeat labs in 8 weeks: Total T, Free T, Estradiol, CBC, PSA",
    "disclaimers": ["AI-generated note -- must be reviewed by a licensed provider."],
    "confidence_score": 0.88,
    "interaction_alerts": []
  },
  "meta": { "latency_ms": 4200, "protocol_count": 2, "language": "en", "note_format": "soap" }
}
```

Supports `Idempotency-Key` (a replay carries `Idempotency-Replay: true`). Recommended client timeout: 100 seconds.

### GET /scribe/health

No authentication required.

## Security & Compliance

### Security Controls

| Control | Implementation |
|---|---|
| API key storage | SHA-256 hash only — plaintext never stored |
| Rate limiting | Per partner, atomic SQL counter (fixed 60s window, cross-instance safe) |
| Budget enforcement | Pre-call check; 429 before any LLM tokens consumed |
| Session fixation | regenerate() on every login |
| IDOR protection | All dossiers and engagement records are ownership-checked |
| Mass assignment | Clean — all inputs validated |
| Search injection | All ILIKE/tsquery parameterized via Drizzle ORM |
| Webhook security | HMAC-SHA256 signature verification (Stripe + Resend); idempotency on all events |
| Path traversal | Boundary whitelist on all file-serving endpoints |
| Auth rate limiting | All auth endpoints independently rate-limited (PG-backed, cross-instance) |
| TLS | TLS 1.3 in transit; AES-256 at rest |
| WAF | Cloud Armor active; scanner traffic blocked |
| CSP / HSTS / CORS | All headers configured; report-uri Sentry telemetry active |
| Clinical guardrails | NVIDIA NeMo · nvidia/llama-3.1-nemotron-nano-8b-v1 (input PII redaction + off-topic filter) · nvidia/llama-3.3-nemotron-super-49b-v1 (citation grounding + dosing safety scan) |
| Supply chain | private: true in package.json; dependency audit clean (Mar 2026) |

### Compliance Posture

- **HIPAA-aligned architecture** — No PHI stored by default; patient data is session-scoped unless the Clients feature is explicitly enabled.
- **BAA available** — Enterprise customers receive a Business Associate Agreement.
- **Encryption** — TLS 1.3 in transit, AES-256 at rest, geographically redundant encrypted backups.
- **Audit logging** — All auth events, API key usage, AI calls, and admin actions written to a tamper-evident audit log.
- **Data residency** — GCC-region and EU residency available on request.
- **Infrastructure** — GCP (us-central1), Cloud Run (autoscaling), Cloud SQL PostgreSQL + pgvector.

GCP inherits: SOC 2 Type II, ISO 27001, HIPAA, PCI DSS, 150+ compliance certifications at the infrastructure layer.

### AI Safety

- NVIDIA NeMo safety layer on every query: input PII redaction + off-topic/harm-framing filter (nvidia/llama-3.1-nemotron-nano-8b-v1, self-hosted on H100); output dosing safety scan with inline warnings.
- PEPTIDE_SAFETY_FOOTER and HELIX_REGULATORY_RULES active on all responses.
- No model training on user data — query data is not used to train or fine-tune any third-party model. Production interactions are quality-filtered and used exclusively in the Hormonaly-1 Data Flywheel (see [Hormonaly-1 LLM](#hormonaly-1-llm)).

Internal benchmarks (May 2026):

| Dimension | Score |
|---|---|
| Citation-grounding pass rate | 100% |
| Safety block rate (on flagged inputs) | 96% |
| RAG retrieval pass rate | 99% |
| Citation faithfulness (PMID-verified) | 97% |

### Uptime

- **Target SLA** — 99.9% monthly uptime for all production API endpoints.
- **P1 incidents** — Acknowledged within 15 minutes, resolved within 4 hours.
- **Status** — `GET https://api.hormonaly.ai/api/v1/helix/status` (authenticated) and `GET /api/v1/helix/health`
- **Maintenance** — Announced ≥ 72 hours in advance.

## Getting Access

### 1. Request Partner API Access

Contact the Hormonaly team to request a Partner API account:

- **Email:** info@hormonaly.ai
- **Enterprise / BD:** hormonaly.ai/about
- **Plans:** hormonaly.ai/pricing

Once your account is approved you receive a Partner Portal invitation. Generate your API key in the Partner Portal (API & Usage → API Keys, `/partner/api`); it is shown once.

### 2. Request Hormonaly-1 LLM Licensing

For enterprise integrators interested in licensing Hormonaly-1 for white-label or embedded clinical AI deployments:

- **LLM Licensing:** partnerships@hormonaly.ai — subject: Hormonaly-1 Licensing Inquiry
- **LLM page:** hormonaly.ai/hormonaly-llm

See the [Hormonaly-1 LLM](#hormonaly-1-llm) section for full model details and licensing tiers.

### 3. First API Call

```bash
curl -X POST https://api.hormonaly.ai/api/v1/helix/query \
  -H "Authorization: Bearer hk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the evidence for semaglutide in metabolic optimization?"}'
```

Buffered clinical answers take about 20–35 seconds; set a client timeout of at least 100 seconds, or stream with `-H "Accept: text/event-stream"`.

### 4. OpenAPI Spec

```bash
curl https://api.hormonaly.ai/openapi.json
```

### 5. Full Documentation

| Resource | URL |
|---|---|
| API Reference | hormonaly.ai/api-docs |
| Technical Manual | hormonaly.ai/manual |
| Partner Portal | hormonaly.ai/partner/login |
| Integration Guide | hormonaly.ai/integration-guide |
| Platform | hormonaly.ai |
| About / Leadership | hormonaly.ai/about |

## Three-Lens Scoring

Three-Lens is Hormonaly's proprietary multi-domain evidence scoring framework. It evaluates a compound independently through three clinical lenses, producing per-lens efficacy and safety scores, an evidence level (A–E), and a synthesized overall recommendation.

### Lenses

| Lens | Domain Label | Focus | Key Endpoints |
|---|---|---|---|
| longevity | Longevity & Anti-Ageing | Slow or reverse biological ageing to extend healthspan and lifespan | Epigenetic clock deceleration, telomere dynamics, senescent cell clearance, NAD+ levels, mitochondrial function, autophagy markers |
| health_disease | Health & Disease Prevention | Detect, prevent, or reverse chronic disease | CVD risk reduction, HbA1c, inflammatory markers (CRP, IL-6), blood pressure, lipid profile, insulin sensitivity |
| performance | Performance Optimization | Elevate cognitive, metabolic, and physical function above baseline | VO2max, grip strength, cognitive processing speed, sleep quality, body composition, HRV, exercise recovery |

### Score Structure

Each lens returns a DomainScore object:

```json
{
  "domain": "longevity",
  "domainLabel": "Longevity & Anti-Ageing",
  "efficacyScore": 7.4,
  "safetyScore": 8.1,
  "evidenceLevel": "C",
  "evidenceLevelLabel": "Low",
  "studyCount": 12,
  "bestStudyType": "Randomized Controlled Trial",
  "keyFindings": ["Demonstrated mTOR inhibition in human pilot (n=24)"],
  "limitations": ["Most trials are short-duration (<12 weeks)"],
  "relevantEndpoints": ["HbA1c", "fasting insulin", "body weight"]
}
```

### Evidence Levels (5-tier)

| Level | Label | Description |
|---|---|---|
| A | High | Multiple consistent RCTs or meta-analyses |
| B | Moderate | At least one RCT or multiple cohort studies |
| C | Low | Case series, observational studies |
| D | Very Low | Expert opinion / anecdotal |
| E | Preclinical | Animal or in vitro studies only |

### Overall Recommendations

| Verdict | Meaning |
|---|---|
| ADOPT | Strong, consistent human evidence supports use |
| CONSIDER | Reasonable evidence — use with informed consent and monitoring |
| WATCH_AND_WAIT | Promising signals but insufficient evidence for routine use |
| AVOID | Evidence against use or unacceptable safety risk |
| INSUFFICIENT_DATA | Too little data to score meaningfully |

### Requesting Three-Lens Scores

Three-Lens is returned in `helix_query` when `include_three_lens: true`, and always in `helix_deep_analysis` and `run_clinical_workflow`:

```bash
curl -X POST https://api.hormonaly.ai/api/v1/helix/query \
  -H "Authorization: Bearer hk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the evidence for rapamycin in longevity?", "include_three_lens": true}'
```

## Webhook Events

Hormonaly delivers async job results (dossiers, batch operations) to partner-configured webhook URLs. Configure in the Partner Portal under Settings → Webhooks.

### Event Types

| Event | Trigger | Payload Fields |
|---|---|---|
| job.completed | Async job finishes successfully | job_id, type, status: "completed", result, completed_at |
| job.failed | Async job fails after all retries | job_id, type, status: "failed", error, completed_at |

### Signature Verification

Every delivery is signed with HMAC-SHA256. The signature is in the `X-Hormonaly-Signature` header:

```
X-Hormonaly-Signature: sha256=<hex_digest>
```

```js
const crypto = require('crypto');
function verifyWebhook(secret, rawBody, receivedSig) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(receivedSig));
}
```

Delivery policy: 3 attempts maximum, exponential back-off (1s → 8s → 64s), 10s timeout per attempt, HTTP 2xx = delivered.

## API Versioning & Stability

Current version: `/api/v1/`

| Tier | Indicator | Commitment |
|---|---|---|
| Stable | No label | Breaking changes announced ≥ 90 days in advance; old version supported ≥ 6 months after deprecation |
| Beta | (beta) in docs | Interface may change; best-effort stability |
| Deprecated | (deprecated) in docs | Scheduled for removal; migration path documented |

### Changelog

| Date | Change |
|---|---|
| Jun 2026 | **Hormonaly-1 LLM launched** — proprietary clinical LLM live on NVIDIA H100 infrastructure; full model card, licensing path, and API integration notes added to public docs |
| Jun 2026 | Overage rate corrected: Starter $100/1M, Advanced $80/1M, Enterprise $25/1M; design partners updated to 21; Hormonaly Library added |
| Jun 2026 | Status emoji replaced with text labels for a cleaner format; Anabol.ai consumer harm-reduction platform added |
| Jun 2026 | Added investors & strategic partners: KBW Ventures (portfolio company) and NVIDIA Inception / Innovation Lab grant |
| Jun 2026 | NVIDIA models updated: NeMo guardrails upgraded to nvidia/llama-3.1-nemotron-nano-8b-v1; NIM inference model nvidia/llama-3.3-nemotron-super-49b-v1 documented |
| Jun 2026 | Tier fallback chains corrected in Query Pipeline and Model Routing: TIER_2 now shows 3-deep chain; TIER_3 now shows 4-deep chain |
| May 2026 | Background agents count updated to ×6; Model routing updated; Tiered token budgets documented; Full 24-tool MCP schemas published; Three-Lens Scoring, Webhook Events, API Versioning sections added |

## Hormonaly-1 LLM

> **Live · June 2026 · NVIDIA Innovation Lab Grant · NIM Stack · H100 · Nemotron 49B · Arabic & English**

Hormonaly-1 is Hormonaly's proprietary clinical large language model — engineered specifically for peptide, hormone, and metabolic medicine. It is fully trained, merged, and deployed on Hormonaly's own NVIDIA H100 infrastructure via the NVIDIA NIM inference stack, with zero dependency on third-party AI APIs at inference time.

### Overview

| Property | Value |
|---|---|
| Model name | Hormonaly-1 |
| Base model | nvidia/llama-3.3-nemotron-super-49b-v1 (Nemotron Super 49B) |
| Training method | Supervised Fine-Tuning (SFT) with LoRA — clinical platform interactions, quality-filtered |
| Domain | Peptide, hormone, and metabolic medicine |
| Languages | Arabic (عربي) + English — natively bilingual |
| Context window | 131,072 tokens |
| Throughput | ~65 tokens/second |
| Inference stack | NVIDIA NIM (self-hosted) |
| Hardware | 8× NVIDIA H100 SXM GPUs |
| Status | Live — June 2026 |
| Backing | NVIDIA Inception member + NVIDIA Innovation Lab grant recipient |

### Capabilities

**Clinical Reasoning at Scale** — Trained directly on real clinical platform interactions via SFT with LoRA. Understands clinical nuance, contraindications, and dosing context across 594+ protocols and 10,000+ indexed studies.

**Bilingual: Arabic & English** — The first clinical LLM optimized for both MENA and English-speaking healthcare markets simultaneously. Both languages are first-class citizens in training data and inference.

**NVIDIA NIM Stack** — Built on the NVIDIA NIM inference stack with Nemotron Super 49B deployed on 8×H100 SXM GPUs. 131k token context window at 65 tok/s for real-time clinical workflows.

**Evidence-Graded Safety** — Every response inherits the Helix evidence-grading pipeline: GRADE-style scoring (A–D), PMID-verified citations, and NeMo safety guardrails. Hormonaly-1 does not hallucinate citations — unverified PMIDs are dropped before delivery.

**Zero Third-Party Dependency at Inference** — Real platform interactions are continuously logged and quality-filtered via the Data Flywheel pipeline, reducing dependence on third-party LLM APIs over time.

### Data Flywheel & Training Pipeline

Hormonaly-1 is produced by the Data Flywheel pipeline — a continuous improvement loop running on the same H100 infrastructure:

1. **Production interactions** from the Helix API and MCP server are logged and quality-filtered (citation faithfulness, clinical coherence, safety flag review).
2. **NeMo SFT fine-tuning** is run on H100 GPUs 4–7 (LoRA, base: nvidia/llama-3.3-nemotron-super-49b-v1).
3. **Merged model checkpoints** are validated against internal clinical benchmarks before promotion to inference.
4. **NVIDIA NIM** serves the merged model on GPUs 0–3 for production inference.

This pipeline is funded in part by the NVIDIA Innovation Lab grant and supported by NVIDIA Inception membership.

### API Integration

Hormonaly-1 is served through the same Helix API endpoints — no schema changes required for integrators. When Hormonaly-1 is active in the routing chain, responses carry an additional `model` field in the metadata:

```json
{
  "type": "metadata",
  "evidence_grade": "B",
  "confidence": 78,
  "verdict": "CONSIDER",
  "citations": 7,
  "model": "hormonaly-1",
  "inference_provider": "nvidia-nim-self-hosted"
}
```

The `inference_provider: "nvidia-nim-self-hosted"` field distinguishes Hormonaly-1 responses from third-party model responses.

### Licensing

Hormonaly-1 is available for enterprise licensing for white-label or embedded clinical AI deployments. Licensing tiers cover:

- **API access** — Hormonaly-1 via the Helix API with full evidence pipeline
- **Embedded deployment** — Self-hosted Hormonaly-1 within a partner's own NVIDIA infrastructure
- **White-label** — Hormonaly-1 branded under your clinical product

To request licensing:

- **Email:** partnerships@hormonaly.ai (subject: Hormonaly-1 Licensing Inquiry)
- **Web:** hormonaly.ai/hormonaly-llm
- Response within 1 business day.

### Model Card Summary

| Dimension | Details |
|---|---|
| Intended use | Clinical decision support, protocol lookup, evidence synthesis, note generation for licensed healthcare providers |
| Not intended for | Consumer self-diagnosis, emergency medical guidance, replacing licensed clinical judgment |
| Training data | Quality-filtered clinical platform interactions (Helix API, MCP), augmented with curated clinical literature |
| Safety measures | NVIDIA NeMo guardrails (PII redaction, dosing safety scan), PEPTIDE_SAFETY_FOOTER, HELIX_REGULATORY_RULES |
| Output disclaimer | Medical disclaimer included on every response; output augments — does not replace — licensed clinician judgment |
| Data privacy | No PHI stored; session-scoped; training data de-identified and quality-reviewed |

## About Hormonaly

Hormonaly was founded by Fady Hannah-Shmouni, MD FRCPC — board-certified endocrinologist and geneticist, NIH-trained, Professor at UBC, with 100+ peer-reviewed publications (h-index 27) and two international clinical guidelines co-authored.

**Leadership:** Fady Hannah-Shmouni, MD FRCPC (CEO/CBO/Founder) · Omar Saleem, MD (Director, AI Academy) · Matt D. Kramer (Healthcare Technology Strategist)

**Advisory Board:** Ali Mostashari, PhD (LifeNome) · Constantine Stratakis, MD (ASTREA) · Cory S. Goldberg, MD · John Kozman (Supernatural) · Dominik Thor, MSc (GCLS) · Labib Ghulmiyyah, MD · Zahraa Abdul Sater, MBBS

**Backed by:** Hormonaly is a portfolio company of KBW Ventures, the global investment firm founded by Prince Khaled bin Alwaleed bin Talal. Hormonaly is also an NVIDIA Inception member and a recipient of an NVIDIA Innovation Lab grant — accelerated compute and engineering support to build clinical-grade, domain-specific AI models for peptide and hormone medicine. In production: a self-hosted 8×H100 SXM node runs three NVIDIA NIM microservices — nvidia/llama-3.3-nemotron-super-49b-v1 (LLM inference for citation grounding and the Ask Hormonaly copilot), nvidia/llama-3.1-nemotron-nano-8b-v1 (NeMo guardrails: PII redaction + dosing safety), and a Rerank NIM — plus the **Hormonaly-1 Data Flywheel pipeline** that fine-tunes Hormonaly-1 using NeMo SFT on H100 GPUs 4–7 (base: nvidia/llama-3.3-nemotron-super-49b-v1, LoRA fine-tuning on high-quality production interactions), progressively reducing dependence on third-party APIs over time.

**Design partner clinics & partners (21):** FORM Face + Body, REBORNE Longevity, Healthspan Digital, PearlMD, Toronto Functional Medicine Centre, A-Life, Astrea Health, Valeo Health, Celia Holdings, Celia Rx, Pillvery, and others.

**Educational partners:** DrVibe.ai (1,000+ clinicians trained across 5 countries) · GCLS.ai (Geneva College of Longevity Science).

**Hormonaly Library (hormonaly.com):** Evidence-based hormone-health books and downloadable PDF guides authored by Fady Hannah-Shmouni, MD FRCPC — including The Peptide Pocket Guide, Peptides Simplified, BPC-157: Evidence Simplified, Peptides, Hormones & Longevity, and Aesthetic & Regenerative Endocrinology (with Arabic editions and free samples).

**Anabol.ai (anabol.ai):** A free, consumer-facing harm-reduction and education platform powered by Hormonaly. AI-powered, evidence-graded research across steroids, peptides, SARMs, and regenerative compounds. Educational resource only — not medical advice.

**Enterprise — TelehealthOS & Canvas Medical:** For enterprise care teams, Hormonaly offers TelehealthOS — a custom, AI-native infrastructure for launching and scaling peptide, hormone, skincare, and longevity telehealth operations. Through a partnership with Canvas Medical, enterprise customers get HIPAA, SOC 2, and HITRUST certified clinical infrastructure: EPCS-ready certified e-prescribing, an integrated EHR/EMR, and compounding fulfillment through 503A and 503B FDA-registered, cGMP pharmacies. Contact info@hormonaly.ai or see hormonaly.ai/telehealth-os.

---

Hormonaly is an educational and clinical decision-support platform. All AI output is intended to augment — not replace — the clinical judgment of a licensed healthcare professional. A medical disclaimer is included on every response. For security disclosures, email fady@hormonaly.ai or use GitHub private vulnerability reporting.

This repository contains no proprietary source code. © Hormonaly — All rights reserved.
