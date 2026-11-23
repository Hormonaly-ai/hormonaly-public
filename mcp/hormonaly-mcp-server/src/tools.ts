/**
 * All MCP tool definitions and handlers for the Hormonaly.ai platform.
 */

import { HoromnalyClient } from "./client.js";

/** Shape of POST /api/v1/helix/query as this server reads it (fields read defensively). */
interface HelixQueryResult {
  data?: Record<string, any>;
  usage?: unknown;
}

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
      "Compare 2–3 compounds head-to-head using the Helix AI engine. Returns a structured comparison with key differences, best-for use cases, and a recommendation. Requires Advanced or Enterprise tier Helix API key — Starter keys are blocked with 403 TIER_REQUIRED.",
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
      "Start generating a full evidence dossier for a compound (async job). Returns a job_id to poll with helix_dossier_status. Requires Advanced or Enterprise tier — Starter keys are blocked with 403 TIER_REQUIRED.",
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
    description: "Answer a complex clinical question (several compounds, a stack, a patient context) through POST /api/v1/helix/query with clinical detail, citations and three-lens scoring. Returns the answer with agents_used, agent_attributions, orchestration_steps and citations. Requires a Helix API key.",
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
    description: "Deep analysis of a clinical topic through POST /api/v1/helix/query with clinical detail, citations and three-lens scoring (longevity / health-disease / performance). Returns the analysis with evidence grade, confidence, citations and related protocols. Requires a Helix API key.",
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
    description: "List every protocol category in the Hormonaly.ai library with protocol counts (GET /api/v2/categories). No authentication required.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "protocol_get_interactions",
    description: "List the known interactions recorded for each compound in a set (GET /api/interactions/for/{slug} per compound, combined). No authentication required.",
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
    description: "Fetch the stored evidence grade (A/B/C/D), study type, PMID and summary for a set of evidence record IDs (POST /api/evidence/batch). Requires a Helix API key.",
    inputSchema: {
      type: "object" as const,
      properties: {
        ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20, description: "Evidence record IDs to GRADE-score" },
        api_key: { type: "string", description: "Helix API key (overrides HORMONALY_API_KEY env var)" },
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
    description: "Get dosing tables, administration routes and cycle guidance for a compound from its protocol record (GET /api/protocols/{slug}). No authentication required.",
    inputSchema: {
      type: "object" as const,
      properties: { slug: { type: "string", description: "Compound slug (e.g. 'testosterone-cypionate', 'bpc-157')" } },
      required: ["slug"],
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
        const result = await effectiveClient.get(`/api/v1/helix/protocols/${encodeURIComponent(String(args["compound"]))}?language=${args["language"] ?? "en"}`, "helix");
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
        const result = await effectiveClient.get(`/api/v1/helix/dossier/${encodeURIComponent(String(args["job_id"]))}`, "helix");
        return ok(result);
      }
      case "helix_deep_analysis": {
        const effectiveClient = withApiKey(client, args["api_key"] as string | undefined);
        // There is no separate deep-analysis route: this is /helix/query with
        // clinical detail, citations and three-lens scoring.
        const result = await effectiveClient.post<HelixQueryResult>("/api/v1/helix/query", {
          question: args["topic"],
          language: args["language"] ?? "en",
          detail_level: "clinical",
          include_citations: true,
          include_three_lens: true,
        }, "helix");
        return ok({
          analysis: result?.data?.["answer"],
          evidence_grade: result?.data?.["grade"],
          confidence: result?.data?.["confidence"],
          three_lens: result?.data?.["three_lens"] ?? null,
          citations: result?.data?.["citations"] ?? [],
          related_protocols: result?.data?.["related_protocols"] ?? [],
          usage: result?.usage,
        });
      }
      case "run_clinical_workflow": {
        const effectiveClient = withApiKey(client, args["api_key"] as string | undefined);
        // There is no separate workflow route: this is /helix/query with the
        // patient context appended to the question.
        const question = String(args["question"]);
        const patientContext = args["patient_context"] as string | undefined;
        const result = await effectiveClient.post<HelixQueryResult>("/api/v1/helix/query", {
          question: patientContext ? `${question}\n\nPatient context: ${patientContext}` : question,
          language: args["language"] ?? "en",
          detail_level: "clinical",
          include_citations: true,
          include_three_lens: true,
        }, "helix");
        return ok({
          answer: result?.data?.["answer"],
          evidence_grade: result?.data?.["grade"],
          confidence: result?.data?.["confidence"],
          agents_used: result?.data?.["agents_used"] ?? [],
          agent_attributions: result?.data?.["agent_attributions"] ?? [],
          orchestration_steps: result?.data?.["orchestration_steps"] ?? [],
          citations: result?.data?.["citations"] ?? [],
          three_lens: result?.data?.["three_lens"] ?? null,
          usage: result?.usage,
        });
      }
      // ── Protocol ────────────────────────────────────────────────────────────────────────────────────────────────
      case "protocol_search": {
        const params = new URLSearchParams({ q: String(args["query"]), limit: String(Math.min(Number(args["limit"] ?? 10), 20)) });
        if (args["category"]) params.set("category", String(args["category"]));
        const result = await client.get(`/api/protocols/search?${params}`, "public");
        return ok(result);
      }
      case "protocol_get": {
        const result = await client.get(`/api/protocols/${encodeURIComponent(String(args["id"]))}`, "public");
        return ok(result);
      }
      case "protocol_list_categories": {
        const result = await client.get("/api/v2/categories", "public");
        return ok(result);
      }
      case "protocol_get_interactions": {
        // No batch route: one GET per compound, combined.
        const compounds = ((args["compounds"] as string[]) ?? []).map(String);
        const perCompound = await Promise.all(
          compounds.map((slug) => client.get<{ interactions?: unknown[] }>(`/api/interactions/for/${encodeURIComponent(slug)}`, "public")),
        );
        return ok({ compounds, interactions: perCompound.flatMap((r) => r?.interactions ?? []) });
      }
      // ── Evidence ────────────────────────────────────────────────────────────────────────────────────────────────
      case "evidence_search": {
        const params = new URLSearchParams({ peptide: String(args["compound"]), maxResults: String(args["max_results"] ?? 10) });
        const result = await client.get(`/api/pubmed/search?${params}`, "public");
        return ok(result);
      }
      case "evidence_get": {
        const result = await client.get(`/api/evidence/${encodeURIComponent(String(args["id"]))}`, "public");
        return ok(result);
      }
      case "evidence_grade": {
        const effectiveClient = withApiKey(client, args["api_key"] as string | undefined);
        // Stored grades via POST /api/evidence/batch. Sent with the API key so
        // the POST is accepted from a server (no browser cookie, no CSRF token).
        const result = await effectiveClient.post<unknown>("/api/evidence/batch", { ids: args["ids"] }, "helix");
        const records: any[] = Array.isArray(result) ? result : ((result as any)?.evidence ?? []);
        return ok({
          count: records.length,
          evidence: records.map((e) => ({
            id: e.id,
            title: e.title ?? e.name ?? null,
            pmid: e.pmid ?? e.pubmedId ?? null,
            study_type: e.studyType ?? e.study_type ?? null,
            grade: e.gradeRating ?? e.grade ?? null,
            confidence: e.confidenceLevel ?? e.confidence ?? null,
            summary: e.summary ?? e.clinicalRelevance ?? null,
          })),
        });
      }
      // ── Compound ────────────────────────────────────────────────────────────────────────────────────────────────
      case "compound_search": {
        const params = new URLSearchParams({ search: String(args["query"]) });
        if (args["category"]) params.set("category", String(args["category"]));
        const result = await client.get(`/api/compounds?${params}`, "public");
        return ok(result);
      }
      case "compound_get_interactions": {
        const result = await client.get(`/api/interactions/for/${encodeURIComponent(String(args["slug"]))}`, "public");
        return ok(result);
      }
      case "compound_get_dosing": {
        // Dosing lives on the protocol record.
        const protocol = await client.get<any>(`/api/protocols/${encodeURIComponent(String(args["slug"]))}`, "public");
        if (!protocol) return err(`No protocol found for compound: ${args["slug"]}`);
        return ok({
          compound: protocol.title ?? protocol.name ?? args["slug"],
          slug: protocol.slug ?? args["slug"],
          evidence_grade: protocol.gradeRating ?? protocol.evidenceGrade ?? null,
          dosing_table: protocol.dosingTable ?? protocol.dosing?.table ?? [],
          dosing_notes: protocol.dosingNotes ?? protocol.dosing?.notes ?? [],
          administration_routes: protocol.administrationRoutes ?? null,
          cycle_guidance: protocol.cycleGuidance ?? null,
          fda_status: protocol.fdaStatus ?? null,
        });
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
  return base.with({ helixApiKey: apiKey });
}
