# Hormonaly MCP Server

Model Context Protocol (MCP) server for the Hormonaly evidence platform. Exposes the Helix AI engine, protocol library, compound database and evidence records to Claude Desktop and any MCP-compatible AI agent.

The server authenticates with a **partner API key only**. It has no session-cookie or admin mode.

## Installation

### Option A — Clone and build (recommended)

```bash
git clone https://github.com/Hormonaly-ai/hormonaly-public.git
cd hormonaly-public/mcp/hormonaly-mcp-server
npm install
npm run build
```

### Option B — Run from the repo directly

```bash
node /path/to/hormonaly-public/mcp/hormonaly-mcp-server/dist/index.js
```

## Configuration for Claude Desktop

Add the following to your `claude_desktop_config.json` (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "hormonaly": {
      "command": "node",
      "args": [
        "/absolute/path/to/hormonaly-public/mcp/hormonaly-mcp-server/dist/index.js"
      ],
      "env": {
        "HORMONALY_API_URL": "https://api.hormonaly.ai",
        "HORMONALY_API_KEY": "hk_live_YOUR_PARTNER_API_KEY"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## Authentication

Every authenticated tool uses a Hormonaly partner API key.

- **Getting a key:** keys are generated in the Partner Portal. Live keys start with `hk_live_`; sandbox keys start with `hk_test_`.
- **stdio (Claude Desktop):** set the key in the environment.

  ```bash
  export HORMONALY_API_KEY=hk_live_...
  ```

  Any `helix_*` tool (and `evidence_grade`) also accepts an `api_key` argument that overrides the environment key for that call.
- **HTTP / SSE (remote):** every request must carry the caller's own key, as `x-api-key: hk_…` or `Authorization: Bearer hk_…`. Requests without a key get `401 authentication_required`; a malformed key gets `401 invalid_api_key`. A key in the server's environment is **never** used by the remote transports.
- Never paste a key into a shared config file or a public repository. Rotate it in the Partner Portal if it leaks.

Tools marked **None** below call public catalog endpoints and need no key over stdio. Over HTTP/SSE the transport itself still requires a key.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HORMONALY_API_URL` | `https://api.hormonaly.ai` | Base URL of the partner API |
| `HORMONALY_API_KEY` | — | Partner API key (`hk_live_…` / `hk_test_…`), stdio only |
| `HTTP_PORT` | — | Set to run the HTTP/SSE transports instead of stdio |
| `MCP_RATE_LIMIT_PER_MINUTE` | `120` | Per-key request limit on one MCP instance (HTTP/SSE) |

## HTTP/SSE Transport (for remote agents)

Start the server in HTTP mode:

```bash
HTTP_PORT=3100 node dist/index.js
# or
node dist/index.js --http
```

Endpoints (all except `/health` require `x-api-key`):

- `POST http://localhost:3100/mcp` — Streamable HTTP (MCP spec 2025-12-11, used by Claude.ai)
- `GET http://localhost:3100/sse` — SSE stream (legacy; connect first)
- `POST http://localhost:3100/messages` — SSE tool calls (legacy; same key as the `/sse` connection)
- `GET http://localhost:3100/health` — Health check

Each key is limited per MCP instance (`MCP_RATE_LIMIT_PER_MINUTE`, default 120); over the limit returns `429 rate_limit_exceeded`. The partner API's own per-partner rate limit still applies to every proxied call.

## Available Tools

17 tools:

| Tool | Auth | Description |
|---|---|---|
| `helix_query` | API key | Clinical question → evidence-graded answer |
| `helix_compare` | API key (Advanced/Enterprise) | Compare 2–3 compounds head-to-head |
| `helix_protocol` | API key | Get all protocols for a compound |
| `helix_dossier_start` | API key (Advanced/Enterprise) | Start async dossier generation |
| `helix_dossier_status` | API key | Poll dossier job status |
| `helix_deep_analysis` | API key | Extended deep analysis (query with three-lens scoring) |
| `run_clinical_workflow` | API key | Full multi-agent clinical workflow |
| `protocol_search` | None | Search protocol library |
| `protocol_get` | None | Get protocol details by ID/slug |
| `protocol_list_categories` | None | List all protocol categories |
| `protocol_get_interactions` | None | Check compound interactions |
| `evidence_search` | None | Search PubMed evidence |
| `evidence_get` | None | Get evidence record by ID |
| `evidence_grade` | API key | Stored evidence grade (A–D) for evidence record IDs |
| `compound_search` | None | Search compound database |
| `compound_get_interactions` | None | Get compound interactions |
| `compound_get_dosing` | None | Get evidence-based dosing |

## Development

```bash
# Build
npm run build

# Clean build
npm run clean && npm run build

# Run in stdio mode (for local testing)
HORMONALY_API_KEY=hk_test_... node dist/index.js

# Run in HTTP mode (callers send their own key)
HTTP_PORT=3100 node dist/index.js
```

---

For full API documentation, see the [main README](../README.md) or visit [hormonaly.ai/api-docs](https://hormonaly.ai/api-docs).
