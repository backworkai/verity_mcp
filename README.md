# Verity MCP Server

Official Model Context Protocol (MCP) server for the [Verity API](https://verity.backworkai.com). It gives AI assistants controlled access to Medicare coverage policies, medical code intelligence, prior authorization checks, claim validation, compliance review, drug formulary evidence, and webhook operations.

## Current Setup

The fastest setup is the hosted Streamable HTTP MCP endpoint:

```bash
export VERITY_API_KEY=vrt_live_YOUR_API_KEY
codex mcp add verity --url https://mcp.verity.backworkai.com/mcp --bearer-token-env-var VERITY_API_KEY
```

Use the local stdio setup when your MCP client does not support remote Streamable HTTP yet, or when you want to run the server entirely on your machine.

## Codex

Codex supports Streamable HTTP MCP servers and can source the bearer token from an environment variable:

```bash
export VERITY_API_KEY=vrt_live_YOUR_API_KEY
codex mcp add verity --url https://mcp.verity.backworkai.com/mcp --bearer-token-env-var VERITY_API_KEY
```

For local stdio:

```bash
export VERITY_API_KEY=vrt_live_YOUR_API_KEY
codex mcp add verity -- npx -y github:backworkai/verity_mcp
```

## Claude Code

For hosted Streamable HTTP:

```bash
export VERITY_API_KEY=vrt_live_YOUR_API_KEY
claude mcp add --transport http verity https://mcp.verity.backworkai.com/mcp --header "Authorization: Bearer $VERITY_API_KEY"
```

For local stdio:

```bash
export VERITY_API_KEY=vrt_live_YOUR_API_KEY
claude mcp add verity -- npx -y github:backworkai/verity_mcp
```

## Cursor, VS Code, Windsurf, and Other MCP Clients

For clients that only support stdio commands:

```json
{
  "mcpServers": {
    "verity": {
      "command": "npx",
      "args": ["-y", "github:backworkai/verity_mcp"],
      "env": {
        "VERITY_API_KEY": "vrt_live_YOUR_API_KEY"
      }
    }
  }
}
```

For clients that support remote URLs and headers:

```json
{
  "mcpServers": {
    "verity": {
      "url": "https://mcp.verity.backworkai.com/mcp",
      "headers": {
        "Authorization": "Bearer ${VERITY_API_KEY}"
      }
    }
  }
}
```

## Self-Hosting

Run a Streamable HTTP server:

```bash
git clone https://github.com/backworkai/verity_mcp.git
cd verity_mcp
npm install
npm run build
npm run start:http
```

Defaults:

| Setting | Default | Override |
| --- | --- | --- |
| Transport | `stdio` | `--http` or `VERITY_MCP_TRANSPORT=http` |
| Host | `127.0.0.1` | `--host` or `VERITY_MCP_HOST` |
| Port | `3000` | `--port` or `VERITY_MCP_PORT` or `PORT` |
| MCP path | `/mcp` | `--path` or `VERITY_MCP_PATH` |
| Allowed hosts | loopback/private hosts, `VERCEL_URL`, or configured public host | `VERITY_MCP_ALLOWED_HOSTS` or `VERITY_MCP_PUBLIC_HOST` |

HTTP mode requires `Authorization: Bearer <Verity API key>` per request by default. For a private single-tenant deployment where the server environment supplies the key, set:

```bash
VERITY_MCP_ALLOW_ENV_KEY=true VERITY_API_KEY=vrt_live_YOUR_API_KEY npm run start:http
```

Only use `VERITY_MCP_ALLOW_ENV_KEY=true` on loopback or private-network deployments protected by network access control. Public deployments should require a bearer token per request, set `VERITY_MCP_ALLOWED_HOSTS`/`VERITY_MCP_PUBLIC_HOST`, and set `VERITY_MCP_ALLOWED_ORIGINS` only to exact browser origins that may connect.

### Vercel Hosting

This repo can deploy as an API-only Vercel project. The production project uses:

```bash
VERITY_MCP_PUBLIC_HOST=mcp.verity.backworkai.com
VERITY_MCP_ALLOWED_HOSTS=mcp.verity.backworkai.com,verity-mcp.vercel.app
```

The Vercel functions expose:

| Path | Purpose |
| --- | --- |
| `/mcp` | Streamable HTTP MCP endpoint |
| `/health` | Lightweight MCP server health check |
| `/` | Basic endpoint metadata |

Health check:

```bash
curl http://localhost:3000/health
```

## Local Development

```bash
npm install
npm run build
VERITY_API_KEY=vrt_live_YOUR_API_KEY npm start
```

Useful commands:

```bash
npm run start:http
node build/src/index.js --help
```

Requires Node.js 18 or newer.

## Available Tools

| Tool | Purpose |
| --- | --- |
| `lookup_code` | Look up a medical code with optional RVU, policy, and rate data |
| `search_policies` | Search Medicare coverage policies |
| `get_policy` | Retrieve a policy by ID |
| `compare_policies` | Compare policy coverage across MAC jurisdictions |
| `get_policy_changes` | Track policy changes over time |
| `search_criteria` | Search extracted coverage criteria blocks |
| `list_jurisdictions` | List MAC jurisdictions and covered states |
| `check_prior_auth` | Check prior authorization requirements |
| `get_health` | Check Verity API health |
| `get_spending_by_code` | Retrieve Medicaid spending data by HCPCS code |
| `validate_claim` | Validate claim coverage and denial risk |
| `research_prior_auth` | Research payer prior authorization requirements |
| `get_prior_auth_research` | Poll a prior authorization research task |
| `batch_lookup_codes` | Look up multiple codes in one request |
| `evaluate_coverage` | Evaluate policy criteria against structured inputs |
| `list_webhooks` | List webhook endpoints |
| `create_webhook` | Create a webhook endpoint |
| `update_webhook` | Update a webhook endpoint |
| `delete_webhook` | Delete a webhook endpoint |
| `test_webhook` | Send a test webhook event |
| `list_unreviewed_changes` | List policy changes awaiting review |
| `acknowledge_change` | Acknowledge one policy change |
| `bulk_acknowledge_changes` | Acknowledge multiple policy changes |
| `get_compliance_stats` | Get compliance dashboard statistics |
| `search_drug_formulary_evidence` | Search commercial drug formulary evidence |

## Example Prompts

```text
Is CPT 76942 covered in Texas, and does it require prior authorization?
```

```text
Compare coverage for J0585 across JM and JH.
```

```text
Validate denial risk for 99213 with diagnosis E11.9 for Medicare in Texas.
```

```text
Search formulary evidence for Ozempic across commercial PBMs.
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `VERITY_API_KEY` | Stdio yes; HTTP no | Verity API key. In HTTP mode, prefer `Authorization: Bearer` per request. |
| `VERITY_API_BASE` | No | Override the API base URL. |
| `VERITY_MCP_TRANSPORT` | No | `stdio` or `http`. |
| `VERITY_MCP_HOST` | No | HTTP bind host. Defaults to `127.0.0.1`. |
| `VERITY_MCP_PORT` | No | HTTP bind port. |
| `VERITY_MCP_PATH` | No | HTTP MCP path. |
| `VERITY_MCP_ALLOWED_ORIGINS` | No | Comma-separated allowed HTTP origins. Loopback origins are allowed for loopback requests. |
| `VERITY_MCP_ALLOW_ORIGIN` | No | Backward-compatible alias for `VERITY_MCP_ALLOWED_ORIGINS`. |
| `VERITY_MCP_ALLOWED_HOSTS` | No | Comma-separated allowed HTTP Host headers for public deployments. |
| `VERITY_MCP_ALLOW_HOST` | No | Backward-compatible alias for `VERITY_MCP_ALLOWED_HOSTS`. |
| `VERITY_MCP_PUBLIC_HOST` | No | Primary public host allowed for HTTP requests. |
| `VERITY_MCP_ALLOW_ENV_KEY` | No | Allow private HTTP requests without bearer auth to use `VERITY_API_KEY`. |

## Troubleshooting

### Missing API Key

For stdio, set `VERITY_API_KEY` in the MCP client configuration. For HTTP, send `Authorization: Bearer <key>`.

### 401 From HTTP MCP

The remote server did not receive a bearer token. Configure your MCP client to send an `Authorization` header or use a client option such as Codex `--bearer-token-env-var`.

### Rate Limits

Wait for the reset window or use a higher-capacity API plan.

## Support

- Documentation: https://verity.backworkai.com/docs
- Issues: https://github.com/backworkai/verity_mcp/issues
- Email: support@verity.backworkai.com

## License

MIT
