—#!/usr/bin/env node
/**
 * Hormonaly.ai MCP Server
 *
 * Exposes the Hormonaly.ai evidence platform as MCP tools for Claude Desktop
 * and other MCP-compatible AI agents.
 *
 * Transports:
 *   stdio           — for Claude Desktop (default when no HTTP_PORT env var)
 *   Streamable HTTP — POST /mcp  (MCP spec 2025-12-11, used by Claude.ai)
 *   SSE (legacy)    — GET /sse + POST /messages  (kept for backwards compat)
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
import express from "express";
import { loadConfig, HoromnalyClient } from "./client.js";
import { TOOL_DEFINITIONS, handleTool } from "./tools.js";

const config = loadConfig();
const client = new HoromnalyClient(config);

function createServer(): Server {
  const server = new Server(
    { name: "hormonaly-mcp-server", version: "1.0.3" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!args || typeof args !== "object") throw new McpError(ErrorCode.InvalidParams, "Tool arguments must be an object");
    if (!TOOL_DEFINITIONS.some((t) => t.name === name)) throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    return handleTool(name, args as Record<string, unknown>, client);
  });
  return server;
}

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[Hormonaly.ai MCP] Running on stdio transport\n");
}

async function runHttp(port: number): Promise<void> {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
    if (_req.method === "OPTIONS") { res.sendStatus(204); return; }
    next();
  });
  app.use(express.json());
  app.get("/health", (_req, res) => { res.json({ status: "ok", server: "hormonaly-mcp", version: "1.0.3" }); });
  app.post("/mcp", async (req, res) => {
    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) { if (!res.headersSent) res.status(500).json({ error: String(err) }); }
  });
  const sseTransports = new Map<string, SSEServerTransport>();
  app.get("/sse", async (req, res) => {
    const sessionId = String(req.query["sessionId"] ?? crypto.randomUUID());
    const transport = new SSEServerTransport(`/messages?sessionId=${sessionId}`, res);
    sseTransports.set(sessionId, transport);
    res.on("close", () => sseTransports.delete(sessionId));
    const server = createServer();
    await server.connect(transport);
  });
  app.post("/messages", async (req, res) => {
    const sessionId = String(req.query["sessionId"] ?? "");
    const transport = sseTransports.get(sessionId);
    if (!transport) { res.status(404).json({ error: "Session not found. Connect to /sse first." }); return; }
    await transport.handlePostMessage(req, res);
  });
  app.listen(port, () => {
    process.stderr.write(`[Hormonaly.ai MCP] HTTP server on http://localhost:${port}\n`);
    process.stderr.write("[Hormonaly.ai MCP] Streamable HTTP : POST /mcp\n");
    process.stderr.write("[Hormonaly.ai MCP] SSE (legacy)    : GET  /sse  |  POST /messages\n");
    process.stderr.write("[Hormonaly.ai MCP] Health           : GET  /health\n");
  });
}

const httpPort = process.env["HTTP_PORT"] ? parseInt(process.env["HTTP_PORT"], 10) : null;
if (httpPort) { runHttp(httpPort); } else { runStdio(); }
