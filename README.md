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

HTTP mode requires `Authorization: Bearer` per request. By default this bearer is a Verity API key for backward compatibility. For hosted remote MCP deployments, enable OAuth protected-resource discovery so Claude-compatible clients can authenticate users through your authorization server:

```bash
VERITY_MCP_AUTH_MODE=oauth \
VERITY_MCP_OAUTH_AUTHORIZATION_SERVERS=https://auth.example.com \
VERITY_MCP_OAUTH_SCOPES=verity:mcp \
npm run start:http
```

The server publishes OAuth Protected Resource Metadata at `/.well-known/oauth-protected-resource` and includes that URL in `WWW-Authenticate` challenges. If your Verity API accepts OAuth access tokens directly, no extra mapping is needed; the MCP server forwards the OAuth bearer downstream. If your authorization server exposes a Verity API key in token introspection, set `VERITY_MCP_OAUTH_INTROSPECTION_URL` and `VERITY_MCP_OAUTH_API_KEY_CLAIM` to validate the access token and map it to the downstream Verity credential.

For a private single-tenant deployment where the server environment supplies the key, set:

```bash
VERITY_MCP_ALLOW_ENV_KEY=true VERITY_API_KEY=vrt_live_YOUR_API_KEY npm run start:http
```

Only use `VERITY_MCP_ALLOW_ENV_KEY=true` on loopback or private-network deployments protected by network access control. Public deployments should require a bearer token per request, set `VERITY_MCP_ALLOWED_HOSTS`/`VERITY_MCP_PUBLIC_HOST`, and set `VERITY_MCP_ALLOWED_ORIGINS` only to exact browser origins that may connect.

### Vercel Hosting

This repo can deploy as an API-only Vercel project. The production project uses:

```bash
VERITY_MCP_PUBLIC_HOST=mcp.verity.backworkai.com
VERITY_MCP_PUBLIC_URL=https://mcp.verity.backworkai.com
VERITY_MCP_ALLOWED_HOSTS=mcp.verity.backworkai.com,verity-mcp.vercel.app
```

The Vercel functions expose:

| Path | Purpose |
| --- | --- |
| `/mcp` | Streamable HTTP MCP endpoint |
| `/health` | Lightweight MCP server health check |
| `/.well-known/oauth-protected-resource` | OAuth protected-resource metadata when OAuth is configured |
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

The package will publish to npm as `@backwork/verity-mcp`.

The npm package is prepared to publish under the Backwork scope as `@backwork/verity-mcp`. Until that package is indexed on npm, use the GitHub `npx` install path below.

1. Configure npm Trusted Publishing for `backworkai/verity_mcp`, workflow `release.yml`, environment `npm`, package `@backwork/verity-mcp`.
2. Update `package.json` and `package-lock.json` to the new version.
3. Push a matching tag, for example `v1.1.1`.
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
| `VERITY_MCP_PUBLIC_URL` | No | Canonical public origin for OAuth metadata, e.g. `https://mcp.verity.backworkai.com`. |
| `VERITY_MCP_ALLOW_ENV_KEY` | No | Allow private HTTP requests without bearer auth to use `VERITY_API_KEY`. |
| `VERITY_MCP_AUTH_MODE` | No | HTTP bearer mode: `api-key`, `oauth`, or `dual`. Defaults to `dual` when OAuth authorization servers are configured, otherwise `api-key`. |
| `VERITY_MCP_OAUTH_AUTHORIZATION_SERVERS` | OAuth | Comma-separated OAuth issuer / authorization server URLs advertised in protected-resource metadata. |
| `VERITY_MCP_OAUTH_RESOURCE` | No | Override the RFC 8707 resource identifier. Defaults to the public MCP URL. |
| `VERITY_MCP_OAUTH_SCOPES` | No | Space- or comma-separated scopes advertised to clients. Defaults to `verity:mcp`. |
| `VERITY_MCP_OAUTH_REQUIRED_SCOPES` | No | Space- or comma-separated scopes required after token introspection. |
| `VERITY_MCP_OAUTH_INTROSPECTION_URL` | No | RFC 7662 token introspection endpoint used to validate OAuth access tokens. |
| `VERITY_MCP_OAUTH_INTROSPECTION_CLIENT_ID` | No | Client ID for introspection basic auth. |
| `VERITY_MCP_OAUTH_INTROSPECTION_CLIENT_SECRET` | No | Client secret for introspection basic auth. |
| `VERITY_MCP_OAUTH_INTROSPECTION_TOKEN` | No | Bearer token for introspection when basic auth is not used. |
| `VERITY_MCP_OAUTH_API_KEY_CLAIM` | No | Dot-path claim from introspection response to use as the downstream Verity credential. If omitted, the OAuth access token is forwarded. |
| `VERITY_MCP_OAUTH_EXPECTED_AUDIENCE` | No | Comma-separated allowed `aud` values when introspection responses include an audience. |

## Troubleshooting

### Missing API Key

For stdio, set `VERITY_API_KEY` in the MCP client configuration. For HTTP API-key mode, send `Authorization: Bearer <key>`. For HTTP OAuth mode, configure `VERITY_MCP_OAUTH_AUTHORIZATION_SERVERS` and send `Authorization: Bearer <access_token>`.

### 401 From HTTP MCP

The remote server did not receive a bearer token. Configure your MCP client to authenticate with OAuth or send an `Authorization` header. OAuth-enabled deployments include `resource_metadata` in the `WWW-Authenticate` header to point clients at `/.well-known/oauth-protected-resource`.

### Rate Limits

Wait for the reset window or use a higher-capacity API plan.

## Support

- Documentation: https://verity.backworkai.com/docs
- Issues: https://github.com/backworkai/verity_mcp/issues
- Email: support@verity.backworkai.com

## License

MIT
