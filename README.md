# Verity MCP Server

An MCP (Model Context Protocol) server that provides AI agents access to the Verity healthcare API for Medicare coverage policies, prior authorization requirements, and medical code lookups.

## Features

- **Code Lookup**: Look up CPT, HCPCS, ICD-10, and NDC codes with descriptions and RVU values
- **Policy Search**: Search and browse Medicare LCDs, NCDs, and Articles
- **Prior Auth Check**: Determine if procedures require prior authorization
- **Coverage Criteria**: Search specific coverage criteria and requirements
- **Jurisdiction Info**: Get MAC jurisdiction details and covered states
- **Policy Comparison**: Compare coverage across different jurisdictions
- **Change Tracking**: Monitor policy updates and modifications

## Installation

### Prerequisites

- Node.js 18 or higher
- A Verity API key (get one at [verity.backworkai.com](https://verity.backworkai.com))

### Setup

1. Clone or download this repository:
   ```bash
   cd verity_mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the server:
   ```bash
   npm run build
   ```

## Configuration

### Claude Desktop

Add the server to your Claude Desktop configuration file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "verity": {
      "command": "node",
      "args": ["C:\\Users\\tyler\\OneDrive\\Desktop\\verity_mcp\\build\\index.js"],
      "env": {
        "VERITY_API_KEY": "vrt_live_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

Replace `YOUR_API_KEY_HERE` with your actual Verity API key.

### Claude Code

```bash
claude mcp add verity node C:\Users\tyler\OneDrive\Desktop\verity_mcp\build\index.js
```

Then set the environment variable:
```bash
set VERITY_API_KEY=vrt_live_YOUR_API_KEY_HERE
```

## Available Tools

### 1. `lookup_code`
Look up a medical code and get coverage information.

```
lookup_code("76942")           # Ultrasound guidance
lookup_code("J0585")           # Botox injection
lookup_code("M54.5")           # Low back pain diagnosis
```

### 2. `search_policies`
Search Medicare coverage policies.

```
search_policies("ultrasound guidance")
search_policies("diabetes CGM")
search_policies("", { policy_type: "NCD" })  # Browse NCDs
```

### 3. `get_policy`
Get detailed policy information by ID.

```
get_policy("L33831")
get_policy("A52458", { include: "criteria,codes" })
```

### 4. `compare_policies`
Compare coverage across MAC jurisdictions.

```
compare_policies(["76942"])
compare_policies(["76942", "76937"], { jurisdictions: ["JM", "JH"] })
```

### 5. `get_policy_changes`
Track policy updates over time.

```
get_policy_changes()
get_policy_changes({ since: "2024-01-01T00:00:00Z" })
get_policy_changes({ policy_id: "L33831" })
```

### 6. `search_criteria`
Search coverage criteria blocks.

```
search_criteria("diabetes")
search_criteria("BMI", { section: "indications" })
search_criteria("frequency", { section: "limitations" })
```

### 7. `list_jurisdictions`
Get MAC jurisdiction information.

```
list_jurisdictions()
```

### 8. `check_prior_auth`
Check prior authorization requirements.

```
check_prior_auth(["76942"])
check_prior_auth(["76942"], { state: "TX" })
check_prior_auth(["J0585"], { diagnosis_codes: ["M62.81"] })
```

### 9. `get_health`
Check API health and dependency status.

```
get_health()
```

### 10. `get_spending_by_code`
Get Medicaid spending data by HCPCS code.

```
get_spending_by_code({ code: "T1019" })
get_spending_by_code({ codes: ["T1019", "T1020"], year: 2023 })
```

### 11. `validate_claim`
Validate claim coverage and denial risk.

```
validate_claim({ procedure_codes: ["99213"], diagnosis_codes: ["E11.9"], payer: "Medicare", state: "TX" })
```

### 12. `research_prior_auth`
Research prior authorization requirements from payer websites.

```
research_prior_auth({ procedure_codes: ["27447"], payer: "UnitedHealthcare", state: "TX", sync: true })
```

### 13. `get_prior_auth_research`
Poll a prior authorization research task.

```
get_prior_auth_research({ research_id: "res_abc123" })
```

### 14. `batch_lookup_codes`
Look up multiple medical codes in one request.

```
batch_lookup_codes({ codes: ["76942", "99213"], include: "rvu,policies" })
```

### 15. `evaluate_coverage`
Evaluate policy criteria against structured parameters.

```
evaluate_coverage({ policy_id: "L33831", parameters: { diagnosis_codes: ["M54.5"] } })
```

### 16-20. Webhooks
List, create, update, delete, and test webhook endpoints.

```
list_webhooks()
create_webhook({ url: "https://example.com/webhooks/verity", events: ["policy.changed"] })
test_webhook({ id: 123 })
```

### 21-24. Compliance
List and acknowledge unreviewed policy changes.

```
list_unreviewed_changes({ limit: 10 })
get_compliance_stats()
acknowledge_change({ diff_id: 123, notes: "Reviewed" })
```

### 25. `search_drug_formulary_evidence`
Search commercial pharmacy-benefit formulary evidence.

```
search_drug_formulary_evidence({ query: "ozempic", payer: "all", limit: 5 })
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VERITY_API_KEY` | Yes | Your Verity API key (starts with `vrt_live_` or `vrt_test_`) |
| `VERITY_API_BASE` | No | API base URL (default: `https://verity.backworkai.com/api/v1`) |

## Development

```bash
# Watch mode for development
npm run dev

# Build
npm run build

# Run the server directly
npm start
```

## Example Conversations

**User**: "Is ultrasound guidance covered for needle placement?"

**Agent uses**: `lookup_code("76942")` and `search_policies("ultrasound guidance needle placement")`

---

**User**: "What are the prior auth requirements for Botox injections in Texas?"

**Agent uses**: `check_prior_auth(["J0585"], { state: "TX" })`

---

**User**: "Compare coverage for CGM devices across California and Texas"

**Agent uses**: `compare_policies(["E0787"], { jurisdictions: ["JE", "JM"] })`

## Troubleshooting

### "VERITY_API_KEY environment variable is required"
Make sure you've set the API key in your Claude Desktop config or environment.

### "API error: 401"
Your API key is invalid or expired. Check that it starts with `vrt_live_` or `vrt_test_`.

### "API error: 429"
Rate limit exceeded. Wait a moment and try again, or upgrade your API plan.

## License

MIT
