—# Hormonaly MCP Server

Model Context Protocol (MCP) server for the Hormonaly evidence platform. Exposes the Helix AI engine, protocol library, compound database, and admin tools to Claude Desktop and any MCP-compatible AI agent.

## Installation

### Option A — Clone and build (recommended)

```bash
# Clone the public repo and build
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

Add the following to your `claude_desktop_config.json` (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\\Claude\\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "hormonaly": {
      "command": "node",
      "args": [
        "/absolute/path/to/hormonaly-public/mcp/hormonaly-mcp-server/dist/index.js"
      ],
      "env": {
        "HORMONALY_API_URL": "https://hormonaly.ai",
        "HORMONALY_API_KEY": "hk_live_YOUR_PARTNER_API_KEY"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## Authentication

### Helix API key (required for helix_* tools)

Get your API key from the [Hormonaly Partner Portal](https://hormonaly.ai/partner/api). Keys start with `hk_live_` and are 72 characters long.

Set via environment variable:

```bash
export HORMONALY_API_KEY=hk_live_...
```

Or pass per-call using the `api_key` parameter on any `helix_*` tool.

### Session token (required for user_* tools)

Get your session cookie from your browser after logging into [hormonaly.ai](https://hormonaly.ai):

1. Log into hormonaly.ai
2. Open DevTools → Application → Cookies
3. Copy the value of `connect.sid`

```bash
export HORMONALY_SESSION_TOKEN=s%3A...
```

Or pass per-call using the `session_token` parameter.

### Admin session token (required for admin_* tools)

Same as session token but for an admin account:

```bash
export HORMONALY_ADMIN_SESSION_TOKEN=s%3A...
```

Or pass per-call using the `admin_session_token` parameter.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HORMONALY_API_URL` | https://hormonaly.ai | Base URL of the platform |
| `HORMONALY_API_KEY` | — | Helix B2B API key (hk_live_...) |
| `HORMONALY_SESSION_TOKEN` | — | User session cookie value |
| `HORMONALY_ADMIN_SESSION_TOKEN` | — | Admin session cookie value |
| `HTTP_PORT` | — | Set to run HTTP/SSE transport instead of stdio |

## HTTP/SSE Transport (for remote agents)

Start the server in HTTP mode:

```bash
HTTP_PORT=3100 node dist/index.js
# or
node dist/index.js --http
```

Endpoints:

- `GET http://localhost:3100/sse` — SSE stream (connect first)
- `POST http://localhost:3100/messages` — Send tool calls
- `POST http://localhost:3100/mcp` — Streamable HTTP (MCP spec 2025-12-11, used by Claude.ai)
- `GET http://localhost:3100/health` — Health check

## Available Tools

24 tools across 6 categories:

| Tool | Auth | Description |
|---|---|---|
| `helix_query` | API key | Clinical question → evidence-graded answer |
| `helix_compare` | API key (Pro+) | Compare 2–3 compounds head-to-head |
| `helix_protocol` | API key | Get all protocols for a compound |
| `helix_dossier_start` | API key (Pro+) | Start async dossier generation |
| `helix_dossier_status` | API key | Poll dossier job status |
| `helix_deep_analysis` | API key (Enterprise) | Extended deep analysis |
| `run_clinical_workflow` | API key | Full multi-agent clinical workflow |
| `protocol_search` | None | Search protocol library |
| `protocol_get` | None | Get protocol details by ID/slug |
| `protocol_list_categories` | None | List all protocol categories |
| `protocol_get_interactions` | None | Check compound interactions |
| `evidence_search` | None | Search PubMed evidence |
| `evidence_get` | None | Get evidence record by ID |
| `evidence_grade` | None | GRADE-score evidence records |
| `compound_search` | None | Search compound database |
| `compound_get_interactions` | None | Get compound interactions |
| `compound_get_dosing` | None | Get evidence-based dosing |
| `user_get_profile` | Session | Get current user profile |
| `user_get_usage` | Session | Get AI usage statistics |
| `user_get_saved_protocols` | Session | Get saved protocols |
| `monitor_protocol_updates` | Session | Check for stale evidence |
| `admin_get_stats` | Admin | Platform-wide statistics |
| `admin_list_users` | Admin | List users |
| `admin_get_ai_costs` | Admin | AI cost breakdown |

## Development

```bash
# Build
npm run build

# Clean build
npm run clean && npm run build

# Run in stdio mode (for local testing)
HORMONALY_API_KEY=hk_live_... node dist/index.js

# Run in HTTP mode
HTTP_PORT=3100 HORMONALY_API_KEY=hk_live_... node dist/index.js
```

---

For full API documentation, see the [main README](../README.md) or visit [hormonaly.ai/api-docs](https://hormonaly.ai/api-docs).
