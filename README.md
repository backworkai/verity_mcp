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
codex mcp add verity --env VERITY_API_KEY=vrt_live_YOUR_API_KEY -- npx -y github:backworkai/verity_mcp
```

## Claude Code

For hosted Streamable HTTP:

```bash
export VERITY_API_KEY=vrt_live_YOUR_API_KEY
claude mcp add --transport http verity https://mcp.verity.backworkai.com/mcp --header "Authorization: Bearer $VERITY_API_KEY"
```

Claude stores HTTP headers in its MCP config. Use a scoped Verity key and rotate it if you later remove this server.

For local stdio:

```bash
claude mcp add verity -e VERITY_API_KEY=vrt_live_YOUR_API_KEY -- npx -y github:backworkai/verity_mcp
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

For clients that support remote URLs and headers, set the bearer header using the client's documented secret or environment mechanism. If the client only accepts static JSON, replace the placeholder directly:

```json
{
  "mcpServers": {
    "verity": {
      "url": "https://mcp.verity.backworkai.com/mcp",
      "headers": {
        "Authorization": "Bearer vrt_live_YOUR_API_KEY"
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

Tool names use the `verity_` prefix for discoverability when this server is installed alongside other MCP servers. The default surface is intentionally workflow-level rather than a 1:1 API wrapper, so agents see fewer choices and common tasks require fewer tool calls.

All tools include `title`, `description`, `inputSchema`, `outputSchema`, and MCP annotations. Successful calls return readable text plus `structuredContent` with `message`, and when available, raw Verity API `data` and `meta`. Tool-level failures return `isError: true`. For tools that combine read and write actions, annotations are conservative at the tool level.

| Primary tool | Purpose |
| --- | --- |
| `verity_coverage_lookup` | Look up procedure codes and combine code details, policy evidence, prior authorization, claim risk, jurisdiction comparison, and spending evidence |
| `verity_policy_research` | Search policies, fetch one policy, search extracted criteria, review policy changes, or map MAC jurisdictions |
| `verity_claim_validation` | Validate claim coverage, documentation requirements, denial risk, and optional policy-specific criteria |
| `verity_prior_auth_research` | Check Medicare prior authorization, start payer website research, or poll an async research task |
| `verity_drug_formulary_research` | Search commercial pharmacy-benefit evidence from CVS Caremark, Express Scripts, and UnitedHealthcare / Optum Rx |
| `verity_compliance_review` | Review compliance stats, list unreviewed policy changes, or acknowledge changes |
| `verity_webhook_management` | List, create, update, delete, or test webhook endpoints |
| `verity_system_health` | Check Verity API health and dependency status |

### Response Format

Every tool accepts:

```json
{
  "response_format": "markdown"
}
```

Use `"markdown"` for readable output or `"json"` to make the text content mirror the returned `structuredContent`.

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

## Testing and Evaluations

Run the build and MCP metadata smoke test:

```bash
npm test
```

The smoke test starts the built stdio server with a dummy key, verifies the 8 workflow tools, checks titles, schemas, annotations, output schemas, `response_format`, and verifies local validation failures are reported with `isError: true`.

The `evals/` directory includes a tool-discoverability evaluation and a read-only data evaluation built from fixed source-backed policy/code records. Refresh the read-only answers intentionally when Verity source data is updated.

## Release

The package publishes to npm as `verity-mcp`.

1. Configure npm Trusted Publishing for `backworkai/verity_mcp`, workflow `release.yml`, package `verity-mcp`.
2. Update `package.json` and `package-lock.json` to the new version.
3. Push a matching tag, for example `v1.1.0`.
4. The release workflow installs with `npm ci`, runs the build/smoke test, verifies `npm pack --dry-run`, and publishes with npm provenance.

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
