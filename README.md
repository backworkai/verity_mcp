# Verity MCP Server

Official Model Context Protocol (MCP) server for the [Verity API](https://verity.backworkai.com). It gives AI assistants controlled access to Medicare coverage policies, medical code intelligence, prior authorization checks, claim validation, compliance review, drug formulary evidence, and webhook operations.

## What It Provides

- Medical code lookup for CPT, HCPCS, ICD-10, and NDC codes
- Policy search, retrieval, change tracking, and jurisdiction comparison
- Prior authorization checks and payer website research
- Claim coverage and denial risk validation
- Coverage criteria search and policy evaluation
- Medicaid spending data by HCPCS code
- Compliance review and acknowledgment workflows
- Drug formulary evidence across supported PBM sources
- Webhook management tools for enterprise integrations

## Installation

```bash
git clone https://github.com/backworkai/verity_mcp.git
cd verity_mcp
npm install
npm run build
```

Requires Node.js 18 or newer.

## Configuration

Set a Verity API key in the MCP server environment:

```bash
export VERITY_API_KEY=vrt_live_YOUR_API_KEY
```

Optional:

```bash
export VERITY_API_BASE=https://verity.backworkai.com/api/v1
```

Get an API key from the [Verity dashboard](https://verity.backworkai.com/dashboard).

### Claude Desktop

Add the server to your Claude Desktop configuration.

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "verity": {
      "command": "node",
      "args": ["/absolute/path/to/verity_mcp/build/index.js"],
      "env": {
        "VERITY_API_KEY": "vrt_live_YOUR_API_KEY"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add verity node /absolute/path/to/verity_mcp/build/index.js
```

### Codex

```bash
codex mcp add verity --env VERITY_API_KEY=vrt_live_YOUR_API_KEY -- node /absolute/path/to/verity_mcp/build/index.js
```

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

## Development

```bash
npm install
npm run build
npm start
```

## Troubleshooting

### Missing API Key

Set `VERITY_API_KEY` in the MCP client configuration or shell environment.

### Authentication Errors

Confirm the key is active and starts with `vrt_live_` or `vrt_test_`.

### Rate Limits

Wait for the reset window or use a higher-capacity API plan.

## Support

- Documentation: https://verity.backworkai.com/docs
- Issues: https://github.com/backworkai/verity_mcp/issues
- Email: support@verity.backworkai.com

## License

MIT
