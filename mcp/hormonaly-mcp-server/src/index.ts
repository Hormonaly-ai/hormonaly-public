#!/usr/bin/env node
/**
 * Hormonaly.ai MCP Server
 *
 * Exposes the Hormonaly.ai evidence platform as MCP tools for Claude Desktop
 * and other MCP-compatible AI agents.
 *
 * Transports:
 *   stdio            — for Claude Desktop (default when no HTTP_PORT env var).
 *                      The partner API key comes from HORMONALY_API_KEY.
 *   Streamable HTTP  — POST /mcp  (MCP spec 2025-12-11, used by Claude.ai)
 *   SSE (legacy)     — GET /sse + POST /messages  (kept for backwards compat)
 *
 * Remote transports authenticate every request with the caller's own partner
 * API key (`x-api-key: hk_…` or `Authorization: Bearer hk_…`), never with a
 * key from the container environment, and only serve the tools that a partner
 * key can legitimately drive. See ./auth.ts.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import express, { type Request, type Response, type NextFunction } from "express";
import { loadConfig, HoromnalyClient } from "./client.js";
import { TOOL_DEFINITIONS, handleTool } from "./tools.js";
import { extractPartnerKey, isRemoteTool, keyFingerprint, limiterFromEnv } from "./auth.js";

const SERVER_VERSION = "1.1.0";

// ─── MCP Server factory ───────────────────────────────────────────────────────

interface ServerOptions {
  /** Remote transports only expose partner-key and public tools. */
  remote: boolean;
}

function createServer(client: HoromnalyClient, opts: ServerOptions): Server {
  const server = new Server(
    { name: "hormonaly-mcp-server", version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  const tools = opts.remote ? TOOL_DEFINITIONS.filter((t) => isRemoteTool(t.name)) : TOOL_DEFINITIONS;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!args || typeof args !== "object") {
      throw new McpError(ErrorCode.InvalidParams, "Tool arguments must be an object");
    }
    if (!tools.some((t) => t.name === name)) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }
    return handleTool(name, args as Record<string, unknown>, client);
  });

  return server;
}

// ─── stdio transport (Claude Desktop) ─────────────────────────────────────────

async function runStdio(): Promise<void> {
  const client = new HoromnalyClient(loadConfig());
  const server = createServer(client, { remote: false });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[Hormonaly.ai MCP] Running on stdio transport\n");
}

// ─── HTTP transports (remote agents / Claude.ai) ──────────────────────────────

/** Request augmented by the auth middleware. */
interface AuthedRequest extends Request {
  partnerClient?: HoromnalyClient;
}

async function runHttp(port: number): Promise<void> {
  const app = express();
  const apiUrl = loadConfig().apiUrl;
  const limiter = limiterFromEnv();

  if (process.env["HORMONALY_API_KEY"]) {
    // A key in the environment of a remote deployment would let unauthenticated
    // callers spend it. It is ignored on purpose; make the misconfiguration visible.
    process.stderr.write(
      "[Hormonaly.ai MCP] WARNING: HORMONALY_API_KEY is set but remote transports never use it. Remove it from the deployment.\n",
    );
  }

  // CORS — allow any origin but only the methods MCP needs.
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, Mcp-Session-Id");
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "hormonaly-mcp", version: SERVER_VERSION });
  });

  /**
   * Every MCP request must present the caller's partner key. The key is bound
   * to a per-request client; nothing is read from the environment.
   */
  const requirePartnerKey = (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const key = extractPartnerKey(req.headers);
    if (key === undefined) {
      res.setHeader("WWW-Authenticate", 'ApiKey realm="hormonaly-mcp", header="x-api-key"');
      res.status(401).json({
        error: "authentication_required",
        message: "Send your Hormonaly partner API key as `x-api-key: hk_…` (or `Authorization: Bearer hk_…`).",
      });
      return;
    }
    if (key === null) {
      res.status(401).json({ error: "invalid_api_key", message: "API key is not in the expected hk_live_/hk_test_ format." });
      return;
    }
    const fp = keyFingerprint(key);
    if (!limiter.take(fp)) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ error: "rate_limit_exceeded", message: "Too many MCP requests for this key. Retry after 60 seconds." });
      return;
    }
    req.partnerClient = new HoromnalyClient({ apiUrl, helixApiKey: key });
    next();
  };

  // ── Streamable HTTP — POST /mcp ─────────────────────────────────────────────
  // MCP spec 2025-12-11. Used by Claude.ai connector directory.
  // Stateless mode: fresh Server + transport per request, bound to the caller's key.
  app.post("/mcp", requirePartnerKey, async (req: AuthedRequest, res) => {
    try {
      const server = createServer(req.partnerClient!, { remote: true });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      // Log the detail here; the response carries a fixed message so an
      // internal error text or stack never reaches the caller.
      console.error(`[mcp] /mcp request failed: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) res.status(500).json({ error: "internal_error", message: "The MCP server could not handle this request." });
    }
  });

  // ── SSE (legacy) — GET /sse + POST /messages ────────────────────────────────
  // The key presented on GET /sse is bound to that session; /messages must
  // present the same key so a session id alone cannot drive another caller's key.
  const sseSessions = new Map<string, { transport: SSEServerTransport; keyFp: string }>();

  app.get("/sse", requirePartnerKey, async (req: AuthedRequest, res) => {
    const sessionId = crypto.randomUUID();
    const transport = new SSEServerTransport(`/messages?sessionId=${sessionId}`, res);
    const keyFp = keyFingerprint(extractPartnerKey(req.headers) as string);
    sseSessions.set(sessionId, { transport, keyFp });
    res.on("close", () => sseSessions.delete(sessionId));
    const server = createServer(req.partnerClient!, { remote: true });
    await server.connect(transport);
  });

  app.post("/messages", requirePartnerKey, async (req: AuthedRequest, res) => {
    const sessionId = String(req.query["sessionId"] ?? "");
    const session = sseSessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "session_not_found", message: "Connect to /sse first." });
      return;
    }
    if (session.keyFp !== keyFingerprint(extractPartnerKey(req.headers) as string)) {
      res.status(403).json({ error: "session_key_mismatch", message: "This session belongs to a different API key." });
      return;
    }
    await session.transport.handlePostMessage(req, res, req.body);
  });

  app.listen(port, () => {
    process.stderr.write(`[Hormonaly.ai MCP] HTTP server on http://localhost:${port}\n`);
    process.stderr.write(`[Hormonaly.ai MCP]   Streamable HTTP : POST /mcp        (x-api-key required)\n`);
    process.stderr.write(`[Hormonaly.ai MCP]   SSE (legacy)    : GET  /sse        (x-api-key required)\n`);
    process.stderr.write(`[Hormonaly.ai MCP]   Health          : GET  /health\n`);
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const useHttp = process.argv.includes("--http") || !!process.env["HTTP_PORT"];
const httpPort = parseInt(process.env["HTTP_PORT"] ?? "3100", 10);

if (useHttp) {
  runHttp(httpPort).catch((e) => {
    process.stderr.write(`[Hormonaly.ai MCP] Fatal: ${e}\n`);
    process.exit(1);
  });
} else {
  runStdio().catch((e) => {
    process.stderr.write(`[Hormonaly.ai MCP] Fatal: ${e}\n`);
    process.exit(1);
  });
}
