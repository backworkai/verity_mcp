#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Configuration
const VERITY_API_BASE = process.env.VERITY_API_BASE || "https://verity.backworkai.com/api/v1";
const VERITY_API_KEY = process.env.VERITY_API_KEY;

// Validate API key on startup
if (!VERITY_API_KEY) {
  console.error("Error: VERITY_API_KEY environment variable is required");
  console.error("Set it with: export VERITY_API_KEY=vrt_live_YOUR_KEY_HERE");
  process.exit(1);
}

// Create server instance
const server = new McpServer({
  name: "verity",
  version: "1.0.0",
});

// Helper function for making Verity API requests
async function verityRequest<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST";
    params?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = "GET", params, body } = options;

  // Build URL with query params
  const url = new URL(`${VERITY_API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${VERITY_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.error?.message || `API error: ${response.status}`;
    const hint = data.error?.hint || "";
    throw new Error(hint ? `${errorMsg}. Hint: ${hint}` : errorMsg);
  }

  return data as T;
}

// Format helpers for clean output
function formatCode(code: any): string {
  const lines: string[] = [];
  lines.push(`Code: ${code.code} (${code.code_system})`);
  if (code.description) lines.push(`Description: ${code.description}`);
  if (code.short_description) lines.push(`Short: ${code.short_description}`);
  if (code.category) lines.push(`Category: ${code.category}`);
  if (code.is_active !== undefined) lines.push(`Active: ${code.is_active ? "Yes" : "No"}`);

  if (code.rvu) {
    lines.push("\nRVU Data:");
    if (code.rvu.work_rvu) lines.push(`  Work RVU: ${code.rvu.work_rvu}`);
    if (code.rvu.total_rvu_facility) lines.push(`  Total RVU (Facility): ${code.rvu.total_rvu_facility}`);
    if (code.rvu.total_rvu_nonfacility) lines.push(`  Total RVU (Non-Facility): ${code.rvu.total_rvu_nonfacility}`);
    if (code.rvu.facility_price) lines.push(`  Facility Price: $${code.rvu.facility_price}`);
    if (code.rvu.non_facility_price) lines.push(`  Non-Facility Price: $${code.rvu.non_facility_price}`);
    if (code.rvu.global_days) lines.push(`  Global Days: ${code.rvu.global_days}`);
  }

  if (code.policies && code.policies.length > 0) {
    lines.push("\nRelated Policies:");
    code.policies.forEach((p: any) => {
      lines.push(`  - ${p.policy_id}: ${p.title}`);
      lines.push(`    Type: ${p.policy_type}, Disposition: ${p.disposition}`);
      if (p.jurisdiction) lines.push(`    Jurisdiction: ${p.jurisdiction}`);
    });
  }

  if (code.suggestions && code.suggestions.length > 0) {
    lines.push("\nSuggested Codes:");
    code.suggestions.slice(0, 5).forEach((s: any) => {
      lines.push(`  - ${s.code} (${s.code_system}): ${s.description || "No description"}`);
      lines.push(`    Match: ${s.match_type}, Score: ${(s.score * 100).toFixed(0)}%`);
    });
  }

  return lines.join("\n");
}

function formatPolicy(policy: any, detailed = false): string {
  const lines: string[] = [];
  lines.push(`Policy: ${policy.policy_id} - ${policy.title}`);
  lines.push(`Type: ${policy.policy_type} | Status: ${policy.status}`);
  if (policy.jurisdiction) lines.push(`Jurisdiction: ${policy.jurisdiction}`);
  if (policy.effective_date) lines.push(`Effective: ${policy.effective_date}`);
  if (policy.retire_date) lines.push(`Retired: ${policy.retire_date}`);

  if (detailed) {
    if (policy.description) lines.push(`\nDescription: ${policy.description}`);
    if (policy.summary) lines.push(`\nSummary: ${policy.summary}`);

    if (policy.mac) {
      lines.push(`\nMAC: ${policy.mac.name} (${policy.mac.jurisdiction_name})`);
      if (policy.mac.states) lines.push(`States: ${policy.mac.states.join(", ")}`);
    }

    if (policy.sections) {
      if (policy.sections.indications) {
        lines.push(`\n--- Indications ---\n${policy.sections.indications.slice(0, 1000)}${policy.sections.indications.length > 1000 ? "..." : ""}`);
      }
      if (policy.sections.limitations) {
        lines.push(`\n--- Limitations ---\n${policy.sections.limitations.slice(0, 1000)}${policy.sections.limitations.length > 1000 ? "..." : ""}`);
      }
      if (policy.sections.documentation) {
        lines.push(`\n--- Documentation Requirements ---\n${policy.sections.documentation.slice(0, 1000)}${policy.sections.documentation.length > 1000 ? "..." : ""}`);
      }
    }

    if (policy.criteria && Object.keys(policy.criteria).length > 0) {
      lines.push("\n--- Coverage Criteria ---");
      Object.entries(policy.criteria).forEach(([section, blocks]: [string, any]) => {
        lines.push(`\n[${section.toUpperCase()}]`);
        blocks.slice(0, 3).forEach((block: any) => {
          lines.push(`  - ${block.text.slice(0, 200)}${block.text.length > 200 ? "..." : ""}`);
          if (block.tags?.length) lines.push(`    Tags: ${block.tags.join(", ")}`);
        });
        if (blocks.length > 3) lines.push(`  ... and ${blocks.length - 3} more criteria`);
      });
    }

    if (policy.codes && Object.keys(policy.codes).length > 0) {
      lines.push("\n--- Associated Codes ---");
      Object.entries(policy.codes).forEach(([system, codes]: [string, any]) => {
        lines.push(`\n[${system}] (${codes.length} codes)`);
        codes.slice(0, 10).forEach((c: any) => {
          lines.push(`  - ${c.code}: ${c.display || "No description"} [${c.disposition}]`);
        });
        if (codes.length > 10) lines.push(`  ... and ${codes.length - 10} more codes`);
      });
    }
  }

  if (policy.source_url) lines.push(`\nSource: ${policy.source_url}`);

  return lines.join("\n");
}

function formatPriorAuth(result: any): string {
  const lines: string[] = [];

  // Main determination
  lines.push(`Prior Authorization Required: ${result.pa_required ? "YES" : "NO"}`);
  lines.push(`Confidence: ${result.confidence.toUpperCase()}`);
  lines.push(`Reason: ${result.reason}`);

  // MAC info
  if (result.mac) {
    lines.push(`\nMAC: ${result.mac.name} (${result.mac.jurisdiction})`);
    if (result.mac.states) lines.push(`States: ${result.mac.states.join(", ")}`);
  }

  // Matched policies
  if (result.matched_policies?.length > 0) {
    lines.push("\n--- Matched Policies ---");
    result.matched_policies.forEach((p: any) => {
      lines.push(`\n${p.policy_id}: ${p.title}`);
      lines.push(`Type: ${p.policy_type}${p.jurisdiction ? ` | Jurisdiction: ${p.jurisdiction}` : ""}`);
      if (p.codes?.length > 0) {
        lines.push("Codes:");
        p.codes.forEach((c: any) => {
          lines.push(`  - ${c.code} (${c.code_system}): ${c.disposition}`);
        });
      }
    });
  }

  // Documentation checklist
  if (result.documentation_checklist?.length > 0) {
    lines.push("\n--- Documentation Checklist ---");
    result.documentation_checklist.forEach((item: string, i: number) => {
      lines.push(`${i + 1}. ${item}`);
    });
  }

  // Criteria details
  if (result.criteria_details) {
    const cd = result.criteria_details;
    if (cd.indications?.length > 0) {
      lines.push("\n--- Indications ---");
      cd.indications.slice(0, 5).forEach((ind: any) => {
        lines.push(`- ${ind.text.slice(0, 200)}${ind.text.length > 200 ? "..." : ""}`);
      });
      if (cd.pagination?.indications?.total > 5) {
        lines.push(`... and ${cd.pagination.indications.total - 5} more indications`);
      }
    }

    if (cd.limitations?.length > 0) {
      lines.push("\n--- Limitations ---");
      cd.limitations.slice(0, 5).forEach((lim: any) => {
        lines.push(`- ${lim.text.slice(0, 200)}${lim.text.length > 200 ? "..." : ""}`);
      });
      if (cd.pagination?.limitations?.total > 5) {
        lines.push(`... and ${cd.pagination.limitations.total - 5} more limitations`);
      }
    }
  }

  return lines.join("\n");
}

// Register tools

// 1. lookup_code - Look up medical codes
server.registerTool(
  "lookup_code",
  {
    description: `Look up a medical code (CPT, HCPCS, ICD-10, or NDC) and get coverage information.
Returns code details, descriptions, RVU values, and related Medicare policies.
Use this to understand what a code means and whether it's covered.

Examples:
- lookup_code("76942") - ultrasound guidance
- lookup_code("J0585") - Botox injection
- lookup_code("M54.5") - low back pain diagnosis`,
    inputSchema: {
      code: z.string().min(1).max(20).describe("The medical code to look up (e.g., 76942, J0585, M54.5)"),
      code_system: z
        .enum(["CPT", "HCPCS", "ICD10CM", "ICD10PCS", "NDC"])
        .optional()
        .describe("Code system hint - auto-detected if not provided"),
      jurisdiction: z.string().max(10).optional().describe("MAC jurisdiction code to filter policies (e.g., JM, JH)"),
      include: z.string().optional().describe("Additional data: 'rvu', 'policies', or 'rvu,policies'"),
      fuzzy: z.boolean().default(true).describe("Enable fuzzy matching for typos/partial codes"),
    },
  },
  async ({ code, code_system, jurisdiction, include, fuzzy }) => {
    try {
      const result = await verityRequest<any>("/codes/lookup", {
        params: {
          code,
          code_system,
          jurisdiction,
          include: include || "rvu,policies",
          fuzzy: fuzzy ? "true" : "false",
        },
      });

      if (!result.data.found && (!result.data.suggestions || result.data.suggestions.length === 0)) {
        return {
          content: [
            {
              type: "text",
              text: `Code "${code}" not found. Try:\n- Check spelling\n- Use a different code system\n- Search for the procedure name using search_policies`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: formatCode(result.data) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error looking up code: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// 2. search_policies - Search coverage policies
server.registerTool(
  "search_policies",
  {
    description: `Search Medicare coverage policies (LCDs, NCDs, Articles).
Use this to find policies related to procedures, conditions, or coverage questions.
Supports keyword and semantic search modes.

Examples:
- search_policies("ultrasound guidance") - find policies about ultrasound
- search_policies("diabetes CGM") - find continuous glucose monitor policies
- search_policies("", { policy_type: "NCD" }) - list all National Coverage Determinations`,
    inputSchema: {
      query: z.string().max(500).optional().describe("Search query - leave empty to browse"),
      mode: z.enum(["keyword", "semantic"]).default("keyword").describe("Search mode: keyword (exact) or semantic (conceptual)"),
      policy_type: z
        .enum(["LCD", "Article", "NCD", "PayerPolicy", "Medical Policy", "Drug Policy"])
        .optional()
        .describe("Filter by policy type"),
      jurisdiction: z.string().max(10).optional().describe("MAC jurisdiction code (e.g., JM, JH, JK)"),
      payer: z.string().max(50).optional().describe("Filter by payer name"),
      status: z.enum(["active", "retired", "all"]).default("active").describe("Policy status filter"),
      limit: z.number().min(1).max(100).default(20).describe("Results per page"),
      cursor: z.string().optional().describe("Pagination cursor from previous response"),
      include: z.string().optional().describe("Additional data: 'summary', 'criteria', 'codes'"),
    },
  },
  async ({ query, mode, policy_type, jurisdiction, payer, status, limit, cursor, include }) => {
    try {
      const result = await verityRequest<any>("/policies", {
        params: {
          q: query,
          mode,
          policy_type,
          jurisdiction,
          payer,
          status,
          limit,
          cursor,
          include,
        },
      });

      if (!result.data || result.data.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No policies found for "${query || "your search"}". Try:\n- Broader search terms\n- Different policy type\n- Remove jurisdiction filter`,
            },
          ],
        };
      }

      const lines: string[] = [`Found ${result.data.length} policies${result.meta?.pagination?.has_more ? " (more available)" : ""}:\n`];

      result.data.forEach((policy: any, i: number) => {
        lines.push(`${i + 1}. ${formatPolicy(policy)}`);
        lines.push("");
      });

      if (result.meta?.pagination?.cursor) {
        lines.push(`\nMore results available. Use cursor: "${result.meta.pagination.cursor}"`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error searching policies: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// 3. get_policy - Get a specific policy by ID
server.registerTool(
  "get_policy",
  {
    description: `Get detailed information about a specific Medicare coverage policy.
Use this after finding a policy ID from search_policies or lookup_code.
Can include criteria, codes, attachments, and version history.

Examples:
- get_policy("L33831") - LCD for ultrasound guidance
- get_policy("A52458", { include: "criteria,codes" }) - with coverage criteria`,
    inputSchema: {
      policy_id: z.string().min(1).describe("Policy ID (e.g., L33831, A52458, NCD220.6)"),
      include: z.string().optional().describe("Additional data: 'criteria', 'codes', 'attachments', 'versions'"),
    },
  },
  async ({ policy_id, include }) => {
    try {
      const result = await verityRequest<any>(`/policies/${encodeURIComponent(policy_id)}`, {
        params: { include },
      });

      return {
        content: [{ type: "text", text: formatPolicy(result.data, true) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error getting policy: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// 4. compare_policies - Compare policies across jurisdictions
server.registerTool(
  "compare_policies",
  {
    description: `Compare coverage policies across different MAC jurisdictions for specific procedure codes.
Useful to understand regional coverage differences for the same procedures.
Shows national vs. jurisdiction-specific policies.

Examples:
- compare_policies(["76942"]) - compare ultrasound guidance coverage nationally
- compare_policies(["76942", "76937"], { jurisdictions: ["JM", "JH"] }) - compare specific regions`,
    inputSchema: {
      procedure_codes: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe("CPT/HCPCS codes to compare (1-10 codes)"),
      policy_type: z.enum(["LCD", "Article", "NCD"]).optional().describe("Filter by policy type"),
      jurisdictions: z
        .array(z.string())
        .max(10)
        .optional()
        .describe("Specific jurisdictions to compare (e.g., ['JM', 'JH'])"),
    },
  },
  async ({ procedure_codes, policy_type, jurisdictions }) => {
    try {
      const result = await verityRequest<any>("/policies/compare", {
        method: "POST",
        body: { procedure_codes, policy_type, jurisdictions },
      });

      const lines: string[] = [];
      const summary = result.data.summary;

      lines.push(`Coverage Comparison for: ${summary.queried_codes.join(", ")}`);
      lines.push(`Jurisdictions analyzed: ${summary.total_jurisdictions}`);
      lines.push(`With coverage: ${summary.jurisdictions_with_coverage}`);
      lines.push(`National policies: ${summary.national_policies_count}`);
      lines.push(`Regional variation: ${summary.has_variation ? "YES" : "NO"}`);

      // National policies
      if (result.data.national_policies?.length > 0) {
        lines.push("\n--- NATIONAL POLICIES ---");
        result.data.national_policies.forEach((p: any) => {
          lines.push(`\n${p.policy_id}: ${p.title}`);
          lines.push(`Type: ${p.policy_type}`);
          if (p.codes?.length > 0) {
            p.codes.forEach((c: any) => {
              lines.push(`  - ${c.code}: ${c.disposition}`);
            });
          }
        });
      }

      // Jurisdiction comparison
      if (result.data.comparison?.length > 0) {
        lines.push("\n--- BY JURISDICTION ---");
        result.data.comparison.forEach((jur: any) => {
          lines.push(`\n[${jur.jurisdiction}] ${jur.mac?.name || ""}`);
          if (jur.mac?.states) lines.push(`States: ${jur.mac.states.join(", ")}`);

          if (jur.coverage_summary) {
            const cs = jur.coverage_summary;
            lines.push(`Coverage: ${cs.covered} covered, ${cs.not_covered} not covered, ${cs.requires_pa} require PA, ${cs.conditional} conditional`);
          }

          if (jur.policies?.length > 0) {
            jur.policies.forEach((p: any) => {
              lines.push(`  ${p.policy_id}: ${p.title}`);
            });
          } else {
            lines.push("  No local policies found");
          }
        });
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error comparing policies: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// 5. get_policy_changes - Track policy updates
server.registerTool(
  "get_policy_changes",
  {
    description: `Track recent changes to Medicare coverage policies.
Useful for monitoring updates, new policies, and retirements.
Can filter by date, policy ID, or change type.

Examples:
- get_policy_changes() - recent changes
- get_policy_changes({ since: "2024-01-01T00:00:00Z" }) - changes since date
- get_policy_changes({ policy_id: "L33831" }) - changes to specific policy`,
    inputSchema: {
      since: z.string().optional().describe("ISO8601 timestamp - only changes after this date"),
      policy_id: z.string().max(50).optional().describe("Filter to a specific policy"),
      change_type: z
        .enum(["created", "updated", "retired", "codes_changed", "criteria_changed", "metadata_changed"])
        .optional()
        .describe("Filter by type of change"),
      limit: z.number().min(1).max(100).default(20).describe("Results per page"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
  },
  async ({ since, policy_id, change_type, limit, cursor }) => {
    try {
      const result = await verityRequest<any>("/policies/changes", {
        params: { since, policy_id, change_type, limit, cursor },
      });

      if (!result.data || result.data.length === 0) {
        return {
          content: [{ type: "text", text: "No policy changes found for the specified criteria." }],
        };
      }

      const lines: string[] = [`Found ${result.data.length} policy changes:\n`];

      result.data.forEach((change: any) => {
        lines.push(`[${change.change_type.toUpperCase()}] ${change.policy_id}: ${change.policy_title}`);
        if (change.changed_at) lines.push(`  Date: ${change.changed_at}`);
        if (change.change_summary) lines.push(`  Summary: ${change.change_summary}`);
        if (change.details?.changed_fields) lines.push(`  Fields: ${change.details.changed_fields.join(", ")}`);
        if (change.details?.added_codes?.length) lines.push(`  Added codes: ${change.details.added_codes.join(", ")}`);
        if (change.details?.removed_codes?.length) lines.push(`  Removed codes: ${change.details.removed_codes.join(", ")}`);
        lines.push("");
      });

      if (result.meta?.pagination?.cursor) {
        lines.push(`More changes available. Use cursor: "${result.meta.pagination.cursor}"`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error getting policy changes: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// 6. search_criteria - Search coverage criteria
server.registerTool(
  "search_criteria",
  {
    description: `Search through coverage criteria blocks across Medicare policies.
Find specific indications, limitations, or documentation requirements.
More targeted than full policy search.

Examples:
- search_criteria("diabetes") - criteria mentioning diabetes
- search_criteria("BMI", { section: "indications" }) - BMI requirements for coverage
- search_criteria("frequency", { section: "limitations" }) - frequency limitations`,
    inputSchema: {
      query: z.string().min(1).max(500).describe("Search query for criteria text"),
      section: z
        .enum(["indications", "limitations", "documentation", "frequency", "other"])
        .optional()
        .describe("Filter by criteria section type"),
      policy_type: z.enum(["LCD", "Article", "NCD", "PayerPolicy"]).optional().describe("Filter by policy type"),
      jurisdiction: z.string().max(10).optional().describe("Filter by MAC jurisdiction"),
      limit: z.number().min(1).max(100).default(20).describe("Results per page"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
  },
  async ({ query, section, policy_type, jurisdiction, limit, cursor }) => {
    try {
      const result = await verityRequest<any>("/coverage/criteria", {
        params: { q: query, section, policy_type, jurisdiction, limit, cursor },
      });

      if (!result.data || result.data.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No criteria found for "${query}". Try:\n- Broader search terms\n- Remove section filter\n- Search full policies instead`,
            },
          ],
        };
      }

      const lines: string[] = [`Found ${result.data.length} matching criteria:\n`];

      result.data.forEach((criteria: any, i: number) => {
        lines.push(`${i + 1}. [${criteria.section.toUpperCase()}] from ${criteria.policy.policy_id}`);
        lines.push(`   Policy: ${criteria.policy.title}`);
        lines.push(`   Text: ${criteria.text.slice(0, 300)}${criteria.text.length > 300 ? "..." : ""}`);
        if (criteria.tags?.length) lines.push(`   Tags: ${criteria.tags.join(", ")}`);
        if (criteria.requires_manual_review) lines.push(`   Note: Requires manual review`);
        lines.push("");
      });

      if (result.meta?.pagination?.cursor) {
        lines.push(`More results available. Use cursor: "${result.meta.pagination.cursor}"`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error searching criteria: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// 7. list_jurisdictions - List MAC jurisdictions
server.registerTool(
  "list_jurisdictions",
  {
    description: `Get list of Medicare Administrative Contractor (MAC) jurisdictions.
Returns MAC names, jurisdiction codes, and covered states.
Use this to find the right jurisdiction for a patient's state.

Example:
- list_jurisdictions() - get all MAC jurisdictions and their states`,
    inputSchema: {},
  },
  async () => {
    try {
      const result = await verityRequest<any>("/jurisdictions");

      const lines: string[] = [`MAC Jurisdictions (${result.data.length} total):\n`];

      result.data.forEach((jur: any) => {
        lines.push(`[${jur.jurisdiction_code}] ${jur.jurisdiction_name || ""}`);
        lines.push(`  MAC: ${jur.mac_name}${jur.mac_code ? ` (${jur.mac_code})` : ""}`);
        if (jur.states?.length) lines.push(`  States: ${jur.states.join(", ")}`);
        if (jur.mac_type) lines.push(`  Type: ${jur.mac_type}`);
        if (jur.website_url) lines.push(`  Website: ${jur.website_url}`);
        lines.push("");
      });

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error listing jurisdictions: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// 8. check_prior_auth - Check prior authorization requirements
server.registerTool(
  "check_prior_auth",
  {
    description: `Check if procedures require prior authorization for Medicare.
Returns PA requirement, confidence level, matched policies, and documentation checklist.
Essential for determining coverage requirements before procedures.

Examples:
- check_prior_auth(["76942"]) - check PA for ultrasound guidance
- check_prior_auth(["76942"], { state: "TX" }) - check for Texas patient
- check_prior_auth(["J0585"], { diagnosis_codes: ["M62.81"] }) - with diagnosis context`,
    inputSchema: {
      procedure_codes: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe("CPT/HCPCS codes to check (1-10 codes)"),
      diagnosis_codes: z
        .array(z.string())
        .max(10)
        .optional()
        .describe("ICD-10 diagnosis codes for additional context"),
      state: z
        .string()
        .length(2)
        .optional()
        .describe("Two-letter state code to determine MAC jurisdiction (e.g., TX, CA)"),
      payer: z
        .enum(["medicare", "aetna", "uhc", "all"])
        .default("medicare")
        .describe("Payer to check"),
    },
  },
  async ({ procedure_codes, diagnosis_codes, state, payer }) => {
    try {
      const result = await verityRequest<any>("/prior-auth/check", {
        method: "POST",
        body: { procedure_codes, diagnosis_codes, state, payer },
      });

      return {
        content: [{ type: "text", text: formatPriorAuth(result.data) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error checking prior auth: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// Main entry point
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Verity MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
