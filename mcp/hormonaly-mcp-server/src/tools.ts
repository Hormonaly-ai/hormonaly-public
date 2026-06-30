/**
 * All MCP tool definitions and handlers for the Hormonaly.ai platform.
 */

import { HoromnalyClient, loadConfig } from "./client.js";

// ─── Tool result helpers ────────────────────────────────────────────────────────────────────────────

function ok(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

// ─── Tool schema definitions ──────────────────────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
  // ── Helix Tools ────────────────────────────────────────────────────────────────────────────────────
  {
    name: "helix_query",
    description:
      "Query the Helix AI engine with a clinical question about peptides, hormones, longevity, or aesthetics. Returns an evidence-based answer with GRADE rating, confidence score, citations, and related protocols. Requires a Helix API key.",
    inputSchema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description: "The clinical question to answer (e.g. 'What is the optimal BPC-157 dose for gut repair?')",
          maxLength: 10000,
        },
        language: {
          type: "string",
          enum: ["en", "ar"],
          default: "en",
          description: "Response language",
        },
        detail_level: {
          type: "string",
          enum: ["clinical", "summary"],
          default: "clinical",
          description: "Level of detail: 'clinical' for full analysis, 'summary' for a concise overview",
        },
        include_citations: {
          type: "boolean",
          default: true,
          description: "Include PubMed citation list in the response",
        },
        include_three_lens: {
          type: "boolean",
          default: false,
          description: "Include Three-Lens analysis (longevity / health-disease / performance scoring)",
        },
        api_key: {
          type: "string",
          description: "Helix API key (overrides HORMONALY_API_KEY env var)",
        },
      },
      required: ["question"],
    },
  },
  {
    name: "helix_compare",
    description:
      "Compare 2–3 compounds head-to-head using the Helix AI engine. Returns a structured comparison with key differences, best-for use cases, and a recommendation. Requires Professional or Enterprise tier Helix API key — Starter keys are blocked with 403 tier_insufficient.",
    inputSchema: {
      type: "object" as const,
      properties: {
        compounds: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 3,
          description: "List of 2 or 3 compound names to compare (e.g. ['semaglutide', 'tirzepatide'])",
        },
        indication: {
          type: "string",
          default: "General comparison",
          description: "Clinical indication or context for the comparison",
        },
        language: { type: "string", enum: ["en", "ar"], default: "en" },
        api_key: { type: "string", description: "Helix API key (overrides HORMONALY_API_KEY env var)" },
      },
      required: ["compounds"],
    },
  },
  {
    name: "helix_protocol",
    description:
      "Retrieve all protocols for a specific compound from the Helix API. Returns titles, evidence grades, FDA status, and summaries. Requires a Helix API key.",
    inputSchema: {
      type: "object" as const,
      properties: {
        compound: { type: "string", description: "Compound name (e.g. 'semaglutide', 'BPC-157', 'testosterone')", maxLength: 200 },
        language: { type: "string", enum: ["en", "ar"], default: "en" },
        api_key: { type: "string", description: "Helix API key (overrides HORMONALY_API_KEY env var)" },
      },
      required: ["compound"],
    },
  },
  {
    name: "helix_dossier_start",
    description:
      "Start generating a full evidence dossier for a compound (async job). Returns a job_id to poll with helix_dossier_status. Requires Professional or Enterprise tier — Starter keys are blocked with 403 tier_insufficient.",
    inputSchema: {
      type: "object" as const,
      properties: {
        compound: { type: "string", description: "Compound name", maxLength: 500 },
        language: { type: "string", enum: ["en", "ar"], default: "en" },
        api_key: { type: "string", description: "Helix API key (overrides HORMONALY_API_KEY env var)" },
      },
      required: ["compound"],
    },
  },
  {
    name: "helix_dossier_status",
    description: "Check the status of a dossier generation job started with helix_dossier_start. Returns status (processing/completed/failed) and the dossier data when complete.",
    inputSchema: {
      type: "object" as const,
      properties: {
        job_id: { type: "string", description: "Job ID returned by helix_dossier_start" },
        api_key: { type: "string", description: "Helix API key (overrides HORMONALY_API_KEY env var)" },
      },
      required: ["job_id"],
    },
  },
  // ── Agentic Workflow Tools ─────────────────────────────────────────────────────────────────────────────
  {
    name: "run_clinical_workflow",
    description: "Run a full multi-agent clinical reasoning workflow on a complex question. This triggers the supervisor/worker pattern: the supervisor decomposes the question, spawns specialized sub-agents (evidence, safety, dosing, regulatory), then synthesizes all findings into a comprehensive clinical report with orchestration_steps[]. Latency: 30–90 seconds. Requires a Helix API key.",
    inputSchema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "Complex clinical question", maxLength: 10000 },
        patient_context: { type: "string", description: "Optional: age, sex, conditions, medications for context" },
        language: { type: "string", enum: ["en", "ar"], default: "en" },
        api_key: { type: "string", description: "Helix API key (overrides HORMONALY_API_KEY env var)" },
      },
      required: ["question"],
    },
  },
  {
    name: "helix_deep_analysis",
    description: "Run an extended deep analysis on a clinical topic using the highest-capability model with full RAG pipeline, three-lens scoring, and citation verification. Returns a comprehensive clinical synthesis with evidence grade, confidence score, PMID citations, and three-lens analysis (longevity / health-disease / performance). Use this for research synthesis, systematic review preparation, or comprehensive protocol evaluation. Requires Enterprise Helix API key.",
    inputSchema: {
      type: "object" as const,
      properties: {
        topic: { type: "string", description: "Clinical topic or question for deep analysis", maxLength: 10000 },
        language: { type: "string", enum: ["en", "ar"], default: "en" },
        api_key: { type: "string", description: "Helix API key (overrides HORMONALY_API_KEY env var)" },
      },
      required: ["topic"],
    },
  },
  // ── Protocol Tools ────────────────────────────────────────────────────────────────────────────────────
  {
    name: "protocol_search",
    description: "Search the Hormonaly.ai protocol library by compound name, category, or condition. Returns a list of matching protocols with titles, evidence grades, and categories. No authentication required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query (compound name, condition, or category)" },
        category: { type: "string", description: "Filter by category slug (e.g. 'weight-loss', 'longevity', 'hormones')" },
        limit: { type: "number", default: 10, description: "Maximum number of results (max 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "protocol_get",
    description: "Get the full details of a protocol by its ID or slug. Returns dosing tables, mechanism steps, safety considerations, citations, and all structured protocol data. No authentication required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Protocol ID or slug (e.g. 'semaglutide-weight-loss')" },
      },
      required: ["id"],
    },
  },
  {
    name: "protocol_list_categories",
    description: "List all protocol categories in the Hormonaly.ai library with protocol counts. No authentication required.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "protocol_get_interactions",
    description: "Check for known interactions between a set of compounds. Uses the public interactions endpoint. No authentication required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        compounds: { type: "array", items: { type: "string" }, minItems: 2, description: "Compound slugs to screen (e.g. ['semaglutide', 'metformin', 'insulin'])" },
      },
      required: ["compounds"],
    },
  },
  // ── Evidence Tools ────────────────────────────────────────────────────────────────────────────────────
  {
    name: "evidence_search",
    description: "Search PubMed for research on a compound or condition. No authentication required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        compound: { type: "string", description: "Compound or condition to search for" },
        max_results: { type: "number", default: 10 },
      },
      required: ["compound"],
    },
  },
  {
    name: "evidence_get",
    description: "Get full details for a specific evidence record by ID. No authentication required.",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "string", description: "Evidence record ID" } },
      required: ["id"],
    },
  },
  {
    name: "evidence_grade",
    description: "Grade a set of evidence records using the GRADE framework. Returns A/B/C/D per study with rationale. No authentication required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20, description: "Evidence record IDs to GRADE-score" },
      },
      required: ["ids"],
    },
  },
  // ── Compound Tools ────────────────────────────────────────────────────────────────────────────────────
  {
    name: "compound_search",
    description: "Search the compound database by name or category. Returns compound names, slugs, and categories. No authentication required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Compound name or partial name to search for" },
        category: { type: "string", description: "Filter by compound category" },
      },
      required: ["query"],
    },
  },
  {
    name: "compound_get_interactions",
    description: "Get all known interactions for a specific compound.",
    inputSchema: {
      type: "object" as const,
      properties: { slug: { type: "string", description: "Compound slug (e.g. 'semaglutide', 'bpc-157')" } },
      required: ["slug"],
    },
  },
  {
    name: "compound_get_dosing",
    description: "Get evidence-based dosing ranges, administration routes, frequency, and cycle guidance for a compound. Returns the full dosing table from the protocol library including dose ranges, units, frequency, and clinical notes. No authentication required.",
    inputSchema: {
      type: "object" as const,
      properties: { slug: { type: "string", description: "Compound slug (e.g. 'testosterone-cypionate', 'bpc-157')" } },
      required: ["slug"],
    },
  },
  // ── User Tools ──────────────────────────────────────────────────────────────────────────────────────
  {
    name: "user_get_profile",
    description: "Get the current user's profile. Requires session authentication.",
    inputSchema: {
      type: "object" as const,
      properties: { session_token: { type: "string", description: "Session token (overrides HORMONALY_SESSION_TOKEN env var)" } },
    },
  },
  {
    name: "user_get_usage",
    description: "Get AI usage statistics for the current user. Requires session authentication.",
    inputSchema: {
      type: "object" as const,
      properties: { session_token: { type: "string", description: "Session token (overrides HORMONALY_SESSION_TOKEN env var)" } },
    },
  },
  {
    name: "user_get_saved_protocols",
    description: "Get the list of protocols saved by the current user. Requires session authentication.",
    inputSchema: {
      type: "object" as const,
      properties: { session_token: { type: "string", description: "Session token (overrides HORMONALY_SESSION_TOKEN env var)" } },
    },
  },
  {
    name: "monitor_protocol_updates",
    description: "Check saved protocols for stale evidence (>90 days). Returns a review_recommended flag and last evidence update date per protocol. Requires session authentication.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_token: { type: "string", description: "Session token (overrides HORMONALY_SESSION_TOKEN env var)" },
        compound_filter: { type: "array", items: { type: "string" }, description: "Filter to specific compounds" },
      },
    },
  },
  // ── Admin Tools ─────────────────────────────────────────────────────────────────────────────────────
  {
    name: "admin_get_stats",
    description: "Get platform-wide statistics (users, protocols, AI costs). Requires admin session.",
    inputSchema: {
      type: "object" as const,
      properties: { admin_session_token: { type: "string", description: "Admin session token (overrides HORMONALY_ADMIN_SESSION_TOKEN env var)" } },
    },
  },
  {
    name: "admin_list_users",
    description: "List platform users with optional search and pagination. Requires admin session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", default: 20, description: "Number of users per page" },
        offset: { type: "number", default: 0, description: "Pagination offset" },
        search: { type: "string", description: "Search by email or name" },
        admin_session_token: { type: "string", description: "Admin session token (overrides HORMONALY_ADMIN_SESSION_TOKEN env var)" },
      },
    },
  },
  {
    name: "admin_get_ai_costs",
    description: "Get AI cost breakdown by model, endpoint, and time period. Requires admin session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        days: { type: "number", default: 30, description: "Number of days to include in the report" },
        admin_session_token: { type: "string", description: "Admin session token (overrides HORMONALY_ADMIN_SESSION_TOKEN env var)" },
      },
    },
  },
] as const;

// ─── Tool handlers ──────────────────────────────────────────────────────────────────────────────────

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  client: HoromnalyClient
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    switch (name) {
      // ── Helix ────────────────────────────────────────────────────────────────────────────────────────────────────
      case "helix_query": {
        const effectiveClient = withApiKey(client, args["api_key"] as string | undefined);
        const result = await effectiveClient.post("/api/v1/helix/query", {
          question: args["question"],
          language: args["language"] ?? "en",
          detail_level: args["detail_level"] ?? "clinical",
          include_citations: args["include_citations"] ?? true,
          include_three_lens: args["include_three_lens"] ?? false,
        }, "helix");
        return ok(result);
      }
      case "helix_compare": {
        const effectiveClient = withApiKey(client, args["api_key"] as string | undefined);
        const result = await effectiveClient.post("/api/v1/helix/compare", {
          compounds: args["compounds"],
          indication: args["indication"] ?? "General comparison",
          language: args["language"] ?? "en",
        }, "helix");
        return ok(result);
      }
      case "helix_protocol": {
        const effectiveClient = withApiKey(client, args["api_key"] as string | undefined);
        const result = await effectiveClient.get(`/api/v1/helix/protocols/${args["compound"]}?language=${args["language"] ?? "en"}`, "helix");
        return ok(result);
      }
      case "helix_dossier_start": {
        const effectiveClient = withApiKey(client, args["api_key"] as string | undefined);
        const result = await effectiveClient.post("/api/v1/helix/dossier", {
          compound: args["compound"],
          language: args["language"] ?? "en",
        }, "helix");
        return ok(result);
      }
      case "helix_dossier_status": {
        const effectiveClient = withApiKey(client, args["api_key"] as string | undefined);
        const result = await effectiveClient.get(`/api/v1/helix/dossier/${args["job_id"]}`, "helix");
        return ok(result);
      }
      case "helix_deep_analysis": {
        const effectiveClient = withApiKey(client, args["api_key"] as string | undefined);
        const result = await effectiveClient.post("/api/v1/helix/deep-analysis", {
          topic: args["topic"],
          language: args["language"] ?? "en",
        }, "helix");
        return ok(result);
      }
      case "run_clinical_workflow": {
        const effectiveClient = withApiKey(client, args["api_key"] as string | undefined);
        const result = await effectiveClient.post("/api/v1/helix/workflow", {
          question: args["question"],
          patient_context: args["patient_context"],
          language: args["language"] ?? "en",
        }, "helix");
        return ok(result);
      }
      // ── Protocol ────────────────────────────────────────────────────────────────────────────────────────────────
      case "protocol_search": {
        const params = new URLSearchParams({ query: String(args["query"]), limit: String(args["limit"] ?? 10) });
        if (args["category"]) params.set("category", String(args["category"]));
        const result = await client.get(`/api/v1/protocols?${params}`, "public");
        return ok(result);
      }
      case "protocol_get": {
        const result = await client.get(`/api/v1/protocols/${args["id"]}`, "public");
        return ok(result);
      }
      case "protocol_list_categories": {
        const result = await client.get("/api/v1/protocols/categories", "public");
        return ok(result);
      }
      case "protocol_get_interactions": {
        const compounds = (args["compounds"] as string[]).join(",");
        const result = await client.get(`/api/interactions/batch?compounds=${compounds}`, "public");
        return ok(result);
      }
      // ── Evidence ────────────────────────────────────────────────────────────────────────────────────────────────
      case "evidence_search": {
        const params = new URLSearchParams({ compound: String(args["compound"]), max_results: String(args["max_results"] ?? 10) });
        const result = await client.get(`/api/v1/evidence?${params}`, "public");
        return ok(result);
      }
      case "evidence_get": {
        const result = await client.get(`/api/v1/evidence/${args["id"]}`, "public");
        return ok(result);
      }
      case "evidence_grade": {
        const result = await client.post("/api/v1/evidence/grade", { ids: args["ids"] }, "public");
        return ok(result);
      }
      // ── Compound ────────────────────────────────────────────────────────────────────────────────────────────────
      case "compound_search": {
        const params = new URLSearchParams({ query: String(args["query"]) });
        if (args["category"]) params.set("category", String(args["category"]));
        const result = await client.get(`/api/v1/compounds?${params}`, "public");
        return ok(result);
      }
      case "compound_get_interactions": {
        const result = await client.get(`/api/interactions/for/${args["slug"]}`, "public");
        return ok(result);
      }
      case "compound_get_dosing": {
        const result = await client.get(`/api/v1/compounds/${args["slug"]}/dosing`, "public");
        return ok(result);
      }
      // ── User ────────────────────────────────────────────────────────────────────────────────────────────────────────
      case "user_get_profile": {
        const effectiveClient = withSessionToken(client, args["session_token"] as string | undefined);
        const result = await effectiveClient.get("/api/user/profile", "session");
        return ok(result);
      }
      case "user_get_usage": {
        const effectiveClient = withSessionToken(client, args["session_token"] as string | undefined);
        const result = await effectiveClient.get("/api/user/usage", "session");
        return ok(result);
      }
      case "user_get_saved_protocols": {
        const effectiveClient = withSessionToken(client, args["session_token"] as string | undefined);
        const result = await effectiveClient.get("/api/user/saved-protocols", "session");
        return ok(result);
      }
      case "monitor_protocol_updates": {
        const effectiveClient = withSessionToken(client, args["session_token"] as string | undefined);
        const result = await effectiveClient.get("/api/user/protocol-updates", "session");
        return ok(result);
      }
      // ── Admin ───────────────────────────────────────────────────────────────────────────────────────────────────────
      case "admin_get_stats": {
        const effectiveClient = withAdminToken(client, args["admin_session_token"] as string | undefined);
        const result = await effectiveClient.get("/api/admin/stats", "admin");
        return ok(result);
      }
      case "admin_list_users": {
        const effectiveClient = withAdminToken(client, args["admin_session_token"] as string | undefined);
        const params = new URLSearchParams({
          limit: String(args["limit"] ?? 20),
          offset: String(args["offset"] ?? 0),
        });
        if (args["search"]) params.set("search", String(args["search"]));
        const result = await effectiveClient.get(`/api/admin/users?${params}`, "admin");
        return ok(result);
      }
      case "admin_get_ai_costs": {
        const effectiveClient = withAdminToken(client, args["admin_session_token"] as string | undefined);
        const result = await effectiveClient.get(`/api/admin/ai-costs?days=${args["days"] ?? 30}`, "admin");
        return ok(result);
      }
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(message);
  }
}

// ─── Auth override helpers ─────────────────────────────────────────────────────────────────────────────

function withApiKey(base: HoromnalyClient, apiKey: string | undefined): HoromnalyClient {
  if (!apiKey) return base;
  return new HoromnalyClient(loadConfig({ apiUrl: base.apiUrl, helixApiKey: apiKey }));
}

function withSessionToken(base: HoromnalyClient, token: string | undefined): HoromnalyClient {
  if (!token) return base;
  return new HoromnalyClient(loadConfig({ apiUrl: base.apiUrl, sessionToken: token }));
}

function withAdminToken(base: HoromnalyClient, token: string | undefined): HoromnalyClient {
  if (!token) return base;
  return new HoromnalyClient(loadConfig({ apiUrl: base.apiUrl, adminSessionToken: token }));
}
