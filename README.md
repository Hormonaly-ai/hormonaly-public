# Hormonaly — Public API & Integration Reference

> **The AI-native clinical OS for peptide, hormone, and longevity medicine.**

[![Status](https://img.shields.io/badge/status-status.hormonaly.ai-brightgreen)](https://status.hormonaly.ai)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-spec-blue)](https://hormonaly.ai/api/v1/helix/openapi.json)
[![MCP Server](https://img.shields.io/badge/MCP-24%20tools-purple)](#mcp-server--tool-schema)

This repository is the public-facing integration reference for enterprise partners and API integrators. The MCP server source is published at [Hormonaly-ai/hormonaly-platform](https://github.com/Hormonaly-ai/hormonaly-platform/tree/main/mcp/hormonaly-mcp-server). For clinical access, visit [hormonaly.ai](https://hormonaly.ai).

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
15. [About Hormonaly](#about-hormonaly)

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
| AI agents | 42 specialist + background agents |
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

Hormonaly is built on a **42-agent orchestration architecture** organized into six categories: Evidence, Research, Clinical, Content, Copilot, and Extraction — plus six continuously-running background agents.

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
    ├── TIER_1_BEST:     Claude Sonnet 4.6 → GPT-4o fallback  (complex/clinical queries)
    ├── TIER_2_BALANCED: Claude Sonnet 4.6 → GPT-4o fallback  (Scribe, CDS, Rx)
    └── TIER_3_FAST:     Claude Haiku 4.5 → GPT-4o Mini fallback  (free tier, Three-Lens scoring)
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
| Multi-agent supervisor/worker | Claude Sonnet 4.6 | 4,000 | SSE + `orchestration_steps[]` |
| Scribe / Rx / Pamphlet | Claude Sonnet 4.6 | 400–4,096 | Structured template (SOAP / DAP / Narrative / Rx) |
| Free-tier (all types) | Claude Haiku 4.5 | Same | Same format; shorter context, reduced RAG chunks |

> **Model routing note:** All tiers use a primary + fallback chain. TIER_1/TIER_2 primary is Claude Sonnet 4.6 with GPT-4o as fallback; TIER_3 primary is Claude Haiku 4.5 with GPT-4o Mini fallback. Gemini 2.5 Flash is available as a TIER_3 tertiary fallback.

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
| `verdict` | `"ADOPT"` \| `"CONSIDER"` \| `"WATCH_AND_WAIT"` \| `"AVOID"` \| `"INSUFFICIENT_DATA"` | Overall clinical verdict (Three-Lens recommendation) |
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

The MCP server source is available in our [GitHub repository](https://github.com/Hormonaly-ai/hormonaly-platform/tree/main/mcp/hormonaly-mcp-server). Clone and build locally:

```bash
git clone https://github.com/Hormonaly-ai/hormonaly-platform.git
cd hormonaly-platform/mcp/hormonaly-mcp-server
npm install && npm run build
```

Then configure Claude Desktop as follows:

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

See the [mcp/README.md](https://github.com/Hormonaly-ai/hormonaly-platform/blob/main/mcp/README.md) for full setup instructions.

### Remote MCP — Claude.ai One-Click Connect

> **Live** · Published May 2026 · Registry: [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)

The Hormonaly MCP server is deployed as a **remote HTTP/SSE server** and listed on the official [MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.Hormonaly-ai/hormonaly`. Enterprise customers using Claude.ai get a **one-click Connect** experience — no local installation, no Docker, no `claude_desktop_config.json` edits required.

#### Endpoints

| Property | Value |
|---|---|
| SSE endpoint | `https://mcp.hormonaly.ai/sse` |
| Registry ID | `io.github.Hormonaly-ai/hormonaly` |
| Auth header | `x-api-key: hk_live_...` (Partner API key) |
| Infrastructure | GCP Cloud Run · Cloudflare DNS · TLS provisioned by GCP |

#### One-Click Connect Flow (Claude.ai Enterprise)

1. Claude.ai discovers Hormonaly via the MCP Registry — no manual URL entry needed
2. User clicks **Connect** — Claude prompts: *"Enter your x-api-key"*
3. User pastes their `hk_live_...` Partner API key (from [Partner Portal → API Keys](https://hormonaly.ai/partner/api))
4. All 24 tools activate immediately in the conversation

#### Authentication & Access Tiers

| Tool group | Auth required | Examples |
|---|---|---|
| Protocol, Evidence, Compound tools (10 tools) | **None** — public read access | `protocol_search`, `evidence_search`, `compound_get_dosing` |
| Helix & agentic tools (7 tools) | API key required | `helix_query`, `run_clinical_workflow`, `helix_deep_analysis` |
| User tools (4 tools) | Session token | `user_get_profile`, `monitor_protocol_updates` |
| Admin tools (3 tools) | Admin session | `admin_get_stats`, `admin_list_users` |

Partner API keys start with `hk_live_` and are issued from the Partner Portal. The key is passed as the `x-api-key` SSE header — Claude.ai will prompt for it on first connect.

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
| `protocol_search` | Search protocol library by compound, category, or condition | Public (no auth) |
| `protocol_get` | Get full protocol details by ID or slug | Public (no auth) |
| `protocol_list_categories` | List all 31+ protocol categories with counts | Public (no auth) |
| `protocol_get_interactions` | Check interactions between a set of compounds | Public (no auth) |

#### Evidence Tools

| Tool | Description | Auth |
|---|---|---|
| `evidence_search` | Search PubMed for research on a compound or condition | Public (no auth) |
| `evidence_get` | Get full evidence record by ID | Public (no auth) |
| `evidence_grade` | Grade a set of PMID references using GRADE framework — returns A/B/C/D per study with rationale | Public (no auth) |

#### Compound Tools

| Tool | Description | Auth |
|---|---|---|
| `compound_search` | Search the compound database by name or category | Public (no auth) |
| `compound_get_interactions` | Get all known interactions for a compound slug | Public (no auth) |
| `compound_get_dosing` | Get evidence-based dosing ranges, routes, and cycle guidance | Public (no auth) |

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

All 24 tool schemas. The `inputSchema` block is what Claude Desktop and MCP clients use to validate parameters before sending.

#### Helix Tools

**`helix_query`**
```json
{
  "name": "helix_query",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question":         { "type": "string", "description": "Clinical question", "maxLength": 10000 },
      "language":         { "type": "string", "enum": ["en","ar"], "default": "en" },
      "detail_level":     { "type": "string", "enum": ["clinical","summary"], "default": "clinical" },
      "include_citations":{ "type": "boolean", "default": true },
      "include_three_lens":{ "type": "boolean", "default": false },
      "api_key":          { "type": "string", "description": "Override env API key" }
    },
    "required": ["question"]
  }
}
```

**`helix_compare`** *(Advanced/Enterprise)*
```json
{
  "name": "helix_compare",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compounds":  { "type": "array", "items": { "type": "string" }, "minItems": 2, "maxItems": 4 },
      "indication": { "type": "string", "default": "General comparison" },
      "language":   { "type": "string", "enum": ["en","ar"], "default": "en" },
      "api_key":    { "type": "string" }
    },
    "required": ["compounds"]
  }
}
```

**`helix_protocol`**
```json
{
  "name": "helix_protocol",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compound":  { "type": "string", "maxLength": 200 },
      "language":  { "type": "string", "enum": ["en","ar"], "default": "en" },
      "api_key":   { "type": "string" }
    },
    "required": ["compound"]
  }
}
```

**`helix_dossier_start`** *(Advanced/Enterprise)*
```json
{
  "name": "helix_dossier_start",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compound":  { "type": "string", "maxLength": 500 },
      "language":  { "type": "string", "enum": ["en","ar"], "default": "en" },
      "api_key":   { "type": "string" }
    },
    "required": ["compound"]
  }
}
```

**`helix_dossier_status`**
```json
{
  "name": "helix_dossier_status",
  "inputSchema": {
    "type": "object",
    "properties": {
      "job_id":  { "type": "string" },
      "api_key": { "type": "string" }
    },
    "required": ["job_id"]
  }
}
```

**`helix_deep_analysis`** *(Enterprise)*
```json
{
  "name": "helix_deep_analysis",
  "inputSchema": {
    "type": "object",
    "properties": {
      "topic":    { "type": "string", "description": "Clinical topic for deep analysis", "maxLength": 10000 },
      "language": { "type": "string", "enum": ["en","ar"], "default": "en" },
      "api_key":  { "type": "string" }
    },
    "required": ["topic"]
  }
}
```

#### Agentic Workflow Tools

**`run_clinical_workflow`**
```json
{
  "name": "run_clinical_workflow",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question":        { "type": "string", "description": "Complex clinical question", "maxLength": 10000 },
      "patient_context": { "type": "string", "description": "Optional: age, sex, conditions, medications" },
      "language":        { "type": "string", "enum": ["en","ar"], "default": "en" },
      "api_key":         { "type": "string" }
    },
    "required": ["question"]
  }
}
```

**`monitor_protocol_updates`** *(session auth)*
```json
{
  "name": "monitor_protocol_updates",
  "inputSchema": {
    "type": "object",
    "properties": {
      "session_token":    { "type": "string" },
      "compound_filter":  { "type": "array", "items": { "type": "string" }, "description": "Filter to specific compounds" }
    }
  }
}
```

#### Protocol Tools

**`protocol_search`**
```json
{
  "name": "protocol_search",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query":    { "type": "string" },
      "category": { "type": "string", "description": "e.g. 'weight-loss', 'hormones'" },
      "limit":    { "type": "number", "default": 10 }
    },
    "required": ["query"]
  }
}
```

**`protocol_get`**
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

**`protocol_list_categories`**
```json
{
  "name": "protocol_list_categories",
  "inputSchema": { "type": "object", "properties": {} }
}
```

**`protocol_get_interactions`**
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

#### Evidence Tools

**`evidence_search`**
```json
{
  "name": "evidence_search",
  "inputSchema": {
    "type": "object",
    "properties": {
      "compound":    { "type": "string" },
      "max_results": { "type": "number", "default": 10 }
    },
    "required": ["compound"]
  }
}
```

**`evidence_get`**
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

**`evidence_grade`**
```json
{
  "name": "evidence_grade",
  "inputSchema": {
    "type": "object",
    "properties": {
      "ids": { "type": "array", "items": { "type": "string" }, "minItems": 1, "maxItems": 20,
               "description": "Evidence record IDs to GRADE-score" }
    },
    "required": ["ids"]
  }
}
```

#### Compound Tools

**`compound_search`**
```json
{
  "name": "compound_search",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query":    { "type": "string" },
      "category": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

**`compound_get_interactions`**
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

**`compound_get_dosing`**
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

#### User Tools *(session auth required)*

**`user_get_profile`**
```json
{
  "name": "user_get_profile",
  "inputSchema": {
    "type": "object",
    "properties": { "session_token": { "type": "string" } }
  }
}
```

**`user_get_usage`**
```json
{
  "name": "user_get_usage",
  "inputSchema": {
    "type": "object",
    "properties": { "session_token": { "type": "string" } }
  }
}
```

**`user_get_saved_protocols`**
```json
{
  "name": "user_get_saved_protocols",
  "inputSchema": {
    "type": "object",
    "properties": { "session_token": { "type": "string" } }
  }
}
```

#### Admin Tools *(admin session required)*

**`admin_get_stats`**
```json
{
  "name": "admin_get_stats",
  "inputSchema": {
    "type": "object",
    "properties": { "admin_session_token": { "type": "string" } }
  }
}
```

**`admin_list_users`**
```json
{
  "name": "admin_list_users",
  "inputSchema": {
    "type": "object",
    "properties": {
      "limit":               { "type": "number", "default": 20 },
      "offset":              { "type": "number", "default": 0 },
      "search":              { "type": "string" },
      "admin_session_token": { "type": "string" }
    }
  }
}
```

**`admin_get_ai_costs`**
```json
{
  "name": "admin_get_ai_costs",
  "inputSchema": {
    "type": "object",
    "properties": {
      "days":                { "type": "number", "default": 30 },
      "admin_session_token": { "type": "string" }
    }
  }
}
```
## Authentication

Hormonaly uses **two independent auth systems** — do not mix them:

### 1. Helix Data API — Bearer Token

All `/api/v1/*` endpoints require:

```
Authorization: Bearer YOUR_API_KEY
```

API keys are SHA-256 hashed before storage. **The plaintext key is shown exactly once at creation** — store it immediately in your secrets manager. If lost, revoke and rotate; there is no recovery path. The same Partner API key is used for both REST and MCP, but the transports differ: REST `/api/v1/*` endpoints expect the key in the `Authorization: Bearer YOUR_API_KEY` header, while the remote MCP/SSE server expects it in the `x-api-key: hk_live_...` header.

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
| **API Starter** | $499 | 5M tokens | 60 req/min | $80 / 1M | 10M tokens (then 429) |
| **API Advanced** | $1,999 | 25M tokens | 150 req/min | $80 / 1M | 75M tokens (then 429) |
| **API Enterprise** | $4,999 | 75M tokens | Custom | Custom | None (overage billed) |
| Legacy partners (pre-billing) | — | — | 20 req/min | — | — |

**Over-limit response:** `HTTP 429` with `Retry-After` header.

**Burst behavior:** The rate limiter uses a sliding 60-second window (atomic SQL counter, cross-instance safe). There is **no burst allowance** — the counter is evaluated on every request, and once the per-minute ceiling is reached the next request immediately returns 429. Honor the `Retry-After` value before retrying.

**Hard cap semantics:** Starter and Advanced plans block at their hard cap (returning 429) until the billing period resets. Enterprise has no hard cap — overage is billed at custom contract rates.

**Quota alerts:** All plans receive email/webhook alerts at **80%** and **100%** of the included token allowance, so you're never surprised by overage.

**Token overage** costs are automatically computed and reflected in your monthly invoice. Rates above are per 1M tokens beyond the included allowance.

**Current usage** is returned in every `/api/v1/helix/query` response in the `usage` object and is visible in the Partner Portal under Usage & Billing.

**Budget enforcement:** Per-plan monthly token budgets are enforced before every call. Calls that would exceed the monthly token allowance or trigger the hard cap are blocked with `429` before any LLM tokens are consumed.

### `usage` Object

Every `POST /api/v1/helix/query` response includes a top-level `usage` object reflecting your real-time token consumption:

```json
{
  "usage": {
    "tokensUsedThisMonth": 1234567,
    "monthlyTokenBudget": 5000000,
    "percentUsed": 24.7,
    "hardCapTokens": 10000000,
    "hardCapExceeded": false,
    "quotaThresholdsCrossed": [80]
  }
}
```

| Field | Type | Description |
|---|---|---|
| `tokensUsedThisMonth` | number | Cumulative tokens consumed in the current billing period |
| `monthlyTokenBudget` | number | Included token allowance for your plan |
| `percentUsed` | number | Percentage of included allowance consumed |
| `hardCapTokens` | number \| null | Hard cap in tokens; `null` = Enterprise (no cap) |
| `hardCapExceeded` | boolean | `true` when the partner has hit or exceeded their hard cap this period |
| `quotaThresholdsCrossed` | number[] | Quota alert thresholds crossed this period (e.g. `[80]` = 80% alert fired) |

> **Billing period scoping:** When a Stripe subscription is active, `tokensUsedThisMonth` is scoped to Stripe's `current_period_start`. For partners without an active subscription the counter falls back to the calendar month.

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
| **Tokens included / month** | 5,000,000 | 25,000,000 | 75,000,000 |
| **Overage rate** | $80 / 1M tokens | $80 / 1M tokens | Custom |
| **Hard cap** | 10M tokens — then 429 | 75M tokens — then 429 | None (overage billed) |
| **Quota alerts** | 80% + 100% | 80% + 100% | 80% + 100% |
| **Rate limit** | 60 req/min | 150 req/min | Custom |

> **Hard cap semantics:** When a Starter or Advanced partner hits their hard cap, the API returns `429 BUDGET_EXCEEDED` for the remainder of the billing period. The counter resets at the start of the next period. Enterprise partners have no hard cap — usage above the included 75M tokens is billed at custom contract rates.

> Token usage is tracked per billing period (scoped to Stripe's `current_period_start` when a subscription is active, or calendar month as a fallback). Current usage is returned in every `/api/v1/helix/query` response in the `usage` object and in the Partner Portal under **Usage & Billing**.

### Feature Access by Tier

| Feature | API Starter | API Advanced | API Enterprise |
|---|---|---|---|
| `/api/v1/helix/query` | Yes | Yes | Yes |
| `/api/v1/helix/protocols/:compound` | Yes | Yes | Yes |
| `/api/v1/scribe/generate` | Yes | Yes | Yes |
| `/api/v1/helix/dossier` | No — 403 | Yes | Yes |
| `/api/v1/helix/compare` | No — 403 | Yes | Yes |
| MCP: `helix_compare` | No | Yes | Yes |
| MCP: `helix_dossier_start` | No | Yes | Yes |
| Seats | Up to 5 | Up to 25 | Unlimited (per contract) |
| White-label portal | No | No | Yes |
| BAA (HIPAA) | No | No | Yes |
| Dedicated support | No | No | Yes |

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

> **Rx & Pamphlet outputs:** Prescription (Rx) generation and patient-facing pamphlets are produced via `POST /api/v1/helix/query` with appropriate clinical context — they are not separate `note_format` values on `/scribe/generate`.

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

- **NVIDIA NeMo safety layer** on every query: input PII redaction + off-topic/harm-framing filter (NVIDIA nemotron-mini-4b-instruct); output dosing safety scan with inline warnings (additive only — never blocks a response, only appends caution flags).
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

## Three-Lens Scoring

Three-Lens is Hormonaly's proprietary multi-domain evidence scoring framework. It evaluates a compound independently through three clinical lenses, producing per-lens efficacy and safety scores, an evidence level (A–E), and a synthesized overall recommendation.

### Lenses

| Lens | Domain Label | Focus | Key Endpoints |
|---|---|---|---|
| `longevity` | Longevity & Anti-Ageing | Slow or reverse biological ageing to extend healthspan and lifespan | Epigenetic clock deceleration, telomere dynamics, senescent cell clearance, NAD+ levels, mitochondrial function, autophagy markers |
| `health_disease` | Health & Disease Prevention | Detect, prevent, or reverse chronic disease | CVD risk reduction, HbA1c, inflammatory markers (CRP, IL-6), blood pressure, lipid profile, insulin sensitivity |
| `performance` | Performance Optimization | Elevate cognitive, metabolic, and physical function above baseline | VO2max, grip strength, cognitive processing speed, sleep quality, body composition, HRV, exercise recovery |

### Score Structure

Each lens returns a `DomainScore` object:

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
  "keyFindings": [
    "Demonstrated mTOR inhibition in human pilot (n=24)",
    "Improved fasting insulin sensitivity over 12 weeks"
  ],
  "limitations": [
    "Most trials are short-duration (<12 weeks)",
    "Dose-response relationship in humans not fully established"
  ],
  "relevantEndpoints": ["HbA1c", "fasting insulin", "body weight", "adiponectin"]
}
```

The top-level response wraps all three lenses plus an overall recommendation:

```json
{
  "longevity":     { ... },
  "healthDisease": { ... },
  "performance":   { ... },
  "overallRecommendation": "CONSIDER",
  "rationale": "Emerging human evidence supports metabolic benefits; longevity-specific endpoints remain preclinical."
}
```

### Evidence Levels (5-tier, not 4-tier GRADE)

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
| `ADOPT` | Strong, consistent human evidence supports use |
| `CONSIDER` | Reasonable evidence — use with informed consent and monitoring |
| `WATCH_AND_WAIT` | Promising signals but insufficient evidence for routine use |
| `AVOID` | Evidence against use or unacceptable safety risk |
| `INSUFFICIENT_DATA` | Too little data to score meaningfully |

### Requesting Three-Lens Scores

Three-Lens is returned in `helix_query` when `include_three_lens: true`, and always in `helix_deep_analysis` and `run_clinical_workflow`:

```bash
curl -X POST https://hormonaly.ai/api/v1/helix/query \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the evidence for rapamycin in longevity?", "include_three_lens": true}'
```

Scores are cached for 24 hours per compound/domain combination and persisted to the platform database for trend analysis.

---

## Webhook Events

Hormonaly delivers async job results (dossiers, batch operations) to partner-configured webhook URLs. Webhooks are configured in the Partner Portal under **Settings → Webhooks**.

### Event Types

| Event | Trigger | Payload Fields |
|---|---|---|
| `job.completed` | Async job (dossier, batch) finishes successfully | `job_id`, `type`, `status: "completed"`, `result`, `completed_at` |
| `job.failed` | Async job fails after all retries | `job_id`, `type`, `status: "failed"`, `error`, `completed_at` |

### Payload Shape

```json
{
  "event": "job.completed",
  "job_id": "dossier_abc123",
  "type": "dossier",
  "status": "completed",
  "result": { ... },
  "error": null,
  "completed_at": "2026-05-17T14:32:01.000Z"
}
```

### Signature Verification

Every delivery is signed with HMAC-SHA256 using your webhook secret. The signature is sent in the `X-Hormonaly-Signature` header:

```
X-Hormonaly-Signature: sha256=<hex_digest>
```

To verify in Node.js:

```js
const crypto = require('crypto');

function verifyWebhook(secret, rawBody, receivedSig) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(receivedSig)
  );
}
```

> **Security:** Webhook URLs must use HTTPS. Private/reserved IP addresses (RFC-1918, loopback, link-local) are rejected server-side (SSRF prevention).

### Delivery Policy

- **Retries:** 3 attempts maximum with exponential back-off: 1 s → 8 s → 64 s
- **Timeout:** 10 seconds per delivery attempt
- **Success:** Any HTTP 2xx response is considered delivered
- **All attempts logged** in Partner Portal under **Webhooks → Delivery Log**

### Configuring Webhooks

1. Partner Portal → **Settings → Webhooks → Add Endpoint**
2. Enter your HTTPS endpoint URL
3. Copy the generated webhook secret — shown once; store immediately
4. Optionally filter to specific event types

---

## API Versioning & Stability

### Current Version

All endpoints documented here are under `/api/v1/`. The version prefix is present in every path (e.g. `POST /api/v1/helix/query`).

### Stability Tiers

| Tier | Indicator | Commitment |
|---|---|---|
| **Stable** | No label | Breaking changes announced ≥ 90 days in advance; old version supported for ≥ 6 months after deprecation notice |
| **Beta** | `(beta)` in docs | Interface may change; best-effort stability; feedback welcome |
| **Deprecated** | `(deprecated)` in docs | Scheduled for removal; migration path documented |

### Deprecation Policy

When an endpoint or field is deprecated:
1. A `Deprecation` header is added to all responses from that endpoint with the sunset date
2. A `Sunset` header is added when the removal date is within 30 days
3. Partners on the affected plan receive an email notification
4. The endpoint continues to function until the sunset date

### Breaking vs. Non-Breaking Changes

**Non-breaking (no notice required):**
- Adding new optional request fields
- Adding new response fields
- Adding new error codes
- Adding new endpoints

**Breaking (≥ 90-day notice):**
- Removing or renaming request/response fields
- Changing field types or enum values
- Changing authentication requirements
- Removing endpoints

### Changelog

| Date | Change |
|---|---|
| May 2026 | Background agents count updated to ×6 (added user-monitor notifications task) |
| May 2026 | Model routing updated: TIER_1/TIER_2 use Claude Sonnet 4.6 primary with GPT-4o fallback; TIER_3 uses Claude Haiku 4.5 primary with GPT-4o Mini fallback |
| May 2026 | Tiered token budgets, hard caps, and overage rates documented (sourced from `shared/plan-pricing.ts`) |
| May 2026 | Full MCP tool schemas (all 24 tools) published |
| May 2026 | Three-Lens Scoring, Webhook Events, API Versioning sections added |
| Jun 2026 | Overage rate updated to $80/1M (Starter/Advanced), custom for Enterprise; design partners and Hormonaly Library added |
| Jun 2026 | Status emoji replaced with text labels for a cleaner format; Anabol.ai consumer harm-reduction platform added |
| Jun 2026 | Added investors & strategic partners: KBW Ventures (portfolio company) and NVIDIA Inception / Innovation Lab grant |
---

## About Hormonaly

Hormonaly was founded by **Fady Hannah-Shmouni, MD FRCPC** — board-certified endocrinologist and geneticist, NIH-trained, Professor at UBC, with 100+ peer-reviewed publications (h-index 27) and two international clinical guidelines co-authored. The platform was built after a decade at the NIH investigating rare endocrine disorders — firsthand evidence that the evidence gap in peptide and hormone medicine was widening faster than clinicians could close it.

**Leadership:** Fady Hannah-Shmouni, MD FRCPC (CEO/CBO/Founder) · Omar Saleem, MD (Director, AI Academy) · Matt D. Kramer (Healthcare Technology Strategist)

**Advisory Board:** Ali Mostashari, PhD (LifeNome) · Constantine Stratakis, MD (ASTREA) · Cory S. Goldberg, MD · John Kozman (Supernatural) · Dominik Thor, MSc (GCLS) · Labib Ghulmiyyah, MD · Zahraa Abdul Sater, MBBS

**Backed by:** Hormonaly is a portfolio company of **KBW Ventures**, the global investment firm founded by Prince Khaled bin Alwaleed bin Talal, with a shared focus on scaling agentic AI across modern medicine and education for the MENA region and beyond. Hormonaly is also an **NVIDIA Inception** member and a recipient of an **NVIDIA Innovation Lab** grant — accelerated compute and engineering support to build clinical-grade, domain-specific AI models (sharper evidence retrieval, GRADE classification, and safety guardrails) for peptide and hormone medicine.

**Design partner clinics & partners (21):** FORM Face + Body, REBORNE Longevity, Healthspan Digital, PearlMD, Toronto Functional Medicine Centre, A-Life, Astrea Health, Valeo Health, Celia Holdings, Celia Rx, Pillvery, and others.

**Educational partners:** DrVibe.ai (1,000+ clinicians trained across 5 countries) · GCLS.ai (Geneva College of Longevity Science) — which certifies Hormonaly's [**AI in Healthcare** certification course](https://gcls.academy/welcome) for physicians, clinical leaders, and healthcare executives.

**Hormonaly Library ([hormonaly.com](https://hormonaly.com/)):** Evidence-based, science-backed hormone-health books and downloadable PDF guides authored by Fady Hannah-Shmouni, MD FRCPC — including *The Peptide Pocket Guide*, *Peptides Simplified*, *BPC-157: Evidence Simplified*, *Peptides, Hormones & Longevity*, and *Aesthetic & Regenerative Endocrinology* (with Arabic editions and free samples). Instant download after checkout.

**Anabol.ai ([anabol.ai](https://www.anabol.ai/)):** A free, consumer-facing harm-reduction and education platform powered by Hormonaly. It provides AI-powered, evidence-graded research across steroids, peptides, SARMs, and regenerative compounds — synthesizing peer-reviewed PubMed studies into clear, sourced answers on dosing, side effects, interactions, and safety. Every compound page surfaces side effects, interactions, and evidence quality, with a multi-agent engine that continuously monitors PubMed and auto-ingests new findings. It is an educational resource only — not medical advice.

### Enterprise — TelehealthOS & Canvas Medical

For enterprise care teams, Hormonaly offers **[TelehealthOS](https://hormonaly.ai/telehealth-os)** — a custom, AI-native infrastructure for launching and scaling peptide, hormone, skincare, and longevity telehealth operations. Through a partnership with **Canvas Medical**, enterprise customers get HIPAA, SOC 2, and HITRUST certified clinical infrastructure: EPCS-ready **certified e-prescribing** (pharmacy routing, drug-interaction checks, and full prescription audit trails), an **integrated EHR/EMR** with charting and patient timelines, and compounding fulfillment through **503A and 503B** FDA-registered, cGMP pharmacies. The Hormonaly clinical API plugs directly into this stack — powering patient intake, lab review, evidence-graded protocol generation, and follow-up. This compliant clinical infrastructure is available exclusively to enterprise care teams via the Canvas Medical integration; contact info@hormonaly.ai or see [hormonaly.ai/telehealth-os](https://hormonaly.ai/telehealth-os).

---

*Hormonaly is an educational and clinical decision-support platform. All AI output is intended to augment — not replace — the clinical judgment of a licensed healthcare professional. A medical disclaimer is included on every response. For security disclosures, email fady@hormonaly.ai or use GitHub private vulnerability reporting.*

*This repository contains no proprietary source code. © Hormonaly — All rights reserved.*
