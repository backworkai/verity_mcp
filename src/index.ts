#!/usr/bin/env node

import { AsyncLocalStorage } from "node:async_hooks";
import { realpathSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

// Configuration
const VERITY_API_BASE = process.env.VERITY_API_BASE || "https://verity.backworkai.com/api/v1";
const requestApiKey = new AsyncLocalStorage<string | undefined>();
const args = process.argv.slice(2);
const shouldShowHelp = args.includes("--help") || args.includes("-h");
const transportMode = (readOption("transport") || process.env.VERITY_MCP_TRANSPORT || (args.includes("--http") ? "http" : "stdio")).toLowerCase();
const httpPath = normalizePath(readOption("path") || process.env.VERITY_MCP_PATH || "/mcp");
const httpHost = readOption("host") || process.env.VERITY_MCP_HOST || "127.0.0.1";
const httpPort = Number(readOption("port") || process.env.VERITY_MCP_PORT || process.env.PORT || "3000");
const allowEnvKeyForHttp = args.includes("--allow-env-key") || process.env.VERITY_MCP_ALLOW_ENV_KEY === "true";
const allowedOrigins = parseAllowedList(process.env.VERITY_MCP_ALLOWED_ORIGINS || process.env.VERITY_MCP_ALLOW_ORIGIN);
const allowedHosts = parseAllowedList(process.env.VERITY_MCP_ALLOWED_HOSTS || process.env.VERITY_MCP_ALLOW_HOST);

type AuthenticatedIncomingMessage = IncomingMessage & { auth?: AuthInfo };

function readOption(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function printHelp(): void {
  console.error(`Verity MCP Server

Usage:
  verity-mcp                         Start stdio transport
  verity-mcp --http                  Start Streamable HTTP transport on /mcp

Options:
  --transport stdio|http             Transport mode (default: stdio)
  --http                             Shortcut for --transport http
  --host 127.0.0.1                   HTTP host (default: 127.0.0.1)
  --port 3000                        HTTP port (default: 3000 or PORT)
  --path /mcp                        HTTP MCP endpoint path (default: /mcp)
  --allow-env-key                    Allow HTTP requests to use VERITY_API_KEY when no bearer token is sent

Authentication:
  stdio requires VERITY_API_KEY in the server environment.
  http expects Authorization: Bearer <VERITY_API_KEY> on each MCP request.
`);
}

function resolveVerityApiKey(): string {
  const apiKey = requestApiKey.getStore() || process.env.VERITY_API_KEY;
  if (!apiKey) {
    throw new Error("Verity API key missing. Set VERITY_API_KEY for stdio, or send Authorization: Bearer <key> for HTTP.");
  }
  return apiKey;
}

function parseAllowedList(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const host = value.trim().toLowerCase();
  if (!host) return undefined;
  if (host.startsWith("[")) {
    return host.slice(1, host.indexOf("]"));
  }
  return host.split(":")[0];
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isPrivateHost(host: string): boolean {
  return (
    isLoopbackHost(host) ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function isAllowedHost(req: IncomingMessage): boolean {
  const requestHost = normalizeHost(req.headers.host);
  if (!requestHost) return false;

  if (allowedHosts.has(requestHost)) return true;

  const vercelUrlHost = normalizeHost(process.env.VERCEL_URL);
  if (vercelUrlHost && requestHost === vercelUrlHost) return true;

  const publicHost = normalizeHost(process.env.VERITY_MCP_PUBLIC_HOST);
  if (publicHost && requestHost === publicHost) return true;

  const configuredHost = normalizeHost(httpHost);
  if (configuredHost && configuredHost !== "0.0.0.0" && requestHost === configuredHost) return true;

  return isPrivateHost(requestHost) && (!configuredHost || configuredHost === "0.0.0.0" || isPrivateHost(configuredHost));
}

function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;

  if (allowedOrigins.has(origin.toLowerCase())) return true;

  try {
    const parsed = new URL(origin);
    const requestHost = normalizeHost(req.headers.host);
    return isLoopbackHost(parsed.hostname.toLowerCase()) && Boolean(requestHost && isLoopbackHost(requestHost));
  } catch {
    return false;
  }
}

function responseOrigin(req: IncomingMessage): string {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(req)) return origin;
  return allowedOrigins.values().next().value || "null";
}

// Helper function for making Verity API requests
async function verityRequest<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    params?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const { method = "GET", params, body, headers: extraHeaders } = options;

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
    Authorization: `Bearer ${resolveVerityApiKey()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extraHeaders,
  };

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : { success: true, data: null };

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

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatClaimValidation(result: any): string {
  const lines: string[] = [];
  lines.push(`Coverage Status: ${result.coverage_status}`);
  const paRequired = result.prior_auth_required === true ? "YES" : result.prior_auth_required === false ? "NO" : "UNKNOWN";
  lines.push(`Prior Auth Required: ${paRequired}`);
  lines.push(`Denial Risk: ${result.denial_risk}`);
  lines.push(`Overall Risk: ${result.overall_risk}`);
  lines.push(`Confidence: ${result.confidence}`);

  if (result.documentation_requirements?.length > 0) {
    lines.push("\n--- Documentation Requirements ---");
    result.documentation_requirements.forEach((item: string) => lines.push(`- ${item}`));
  }

  if (result.known_gaps?.length > 0) {
    lines.push("\n--- Known Gaps ---");
    result.known_gaps.forEach((item: string) => lines.push(`- ${item}`));
  }

  if (result.issues?.length > 0) {
    lines.push("\n--- Issues ---");
    result.issues.forEach((item: string) => lines.push(`- ${item}`));
  }

  const matchedPolicies = result.matched_policies ?? [];
  if (matchedPolicies.length > 0) {
    lines.push("\n--- Matched Policies ---");
    matchedPolicies.slice(0, 5).forEach((policy: any) => {
      const jurisdiction = policy.jurisdiction ? ` (${policy.jurisdiction})` : "";
      lines.push(`- ${policy.policy_id}: ${policy.title}${jurisdiction}`);
    });
    if (matchedPolicies.length > 5) lines.push(`... and ${matchedPolicies.length - 5} more policies`);
  }

  if (result.codes?.length > 0) {
    lines.push("\n--- Code-Level Results ---");
    result.codes.forEach((code: any) => {
      const codePa = code.prior_auth_required === true ? "yes" : code.prior_auth_required === false ? "no" : "unknown";
      lines.push(`${code.code}: ${code.coverage_status}, PA: ${codePa}, risk: ${code.denial_risk}`);
      if (code.issues?.length) lines.push(`  Issues: ${code.issues.join("; ")}`);
    });
  }

  return lines.join("\n");
}

function formatResearch(result: any): string {
  const lines: string[] = [];
  lines.push(`Research ID: ${result.research_id}`);
  lines.push(`Status: ${result.status}`);
  if (result.created_at) lines.push(`Created: ${result.created_at}`);
  if (result.finished_at) lines.push(`Finished: ${result.finished_at}`);
  if (result.poll_url) lines.push(`Poll URL: ${result.poll_url}`);

  if (result.result?.determination) {
    const determination = result.result.determination;
    lines.push("\n--- Determination ---");
    lines.push(`PA Required: ${determination.pa_required ? "YES" : "NO"}`);
    lines.push(`Confidence: ${determination.confidence}`);
    if (determination.reasoning) lines.push(`Reasoning: ${determination.reasoning}`);
  }

  if (result.result?.documentation_requirements?.length) {
    lines.push("\n--- Documentation Requirements ---");
    result.result.documentation_requirements.forEach((item: string) => lines.push(`- ${item}`));
  }

  if (result.error) lines.push(`\nError: ${result.error}`);
  return lines.join("\n");
}

function createVerityMcpServer(): McpServer {
const server = new McpServer({
  name: "verity",
  version: "1.0.0",
});

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
        const policyId = criteria.policy_id ?? criteria.policy?.policy_id ?? "unknown policy";
        const policyTitle = criteria.policy_title ?? criteria.policy?.title ?? "Untitled policy";
        const policyType = criteria.policy_type ?? criteria.policy?.policy_type;
        const jurisdiction = criteria.jurisdiction ?? criteria.policy?.jurisdiction;
        const context = [policyType, jurisdiction].filter(Boolean).join(" / ");
        lines.push(`${i + 1}. [${criteria.section.toUpperCase()}] from ${policyId}`);
        lines.push(`   Policy: ${policyTitle}${context ? ` (${context})` : ""}`);
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

// 8. check_prior_auth - Check Medicare prior authorization requirements
server.registerTool(
  "check_prior_auth",
  {
    description: `Check if procedures require prior authorization for Medicare.
Returns PA requirement, confidence level, matched LCD/NCD policies, and documentation checklist.
Essential for determining Medicare coverage requirements before procedures.

Examples:
- check_prior_auth(["76942"]) - check PA for ultrasound guidance
- check_prior_auth(["76942"], { state: "TX" }) - check for Texas patient (determines MAC jurisdiction)
- check_prior_auth(["J0585", "64493"]) - check multiple procedure codes`,
    inputSchema: {
      procedure_codes: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe("CPT/HCPCS codes to check (1-10 codes)"),
      state: z
        .string()
        .length(2)
        .optional()
        .describe("Two-letter state code to determine MAC jurisdiction (e.g., TX, CA)"),
    },
  },
  async ({ procedure_codes, state }) => {
    try {
      const result = await verityRequest<any>("/prior-auth/check", {
        method: "POST",
        body: { procedure_codes, state },
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

// 9. get_health - API health check
server.registerTool(
  "get_health",
  {
    description: "Check Verity API health and dependency status.",
    inputSchema: {},
  },
  async () => {
    try {
      const result = await verityRequest<any>("/health");
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error checking health: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 10. get_spending_by_code - Medicaid spending data
server.registerTool(
  "get_spending_by_code",
  {
    description: "Get Medicaid provider spending statistics for one or more HCPCS codes.",
    inputSchema: {
      code: z.string().optional().describe("Single HCPCS code"),
      codes: z.array(z.string()).max(10).optional().describe("Multiple HCPCS codes"),
      year: z.number().int().optional().describe("Optional year filter"),
    },
  },
  async ({ code, codes, year }) => {
    try {
      if ((code && codes?.length) || (!code && !codes?.length)) {
        return {
          content: [
            {
              type: "text",
              text: "Error getting spending data: provide exactly one of code or codes.",
            },
          ],
        };
      }

      const result = await verityRequest<any>("/spending/by-code", {
        params: { code, codes: codes?.join(","), year },
      });
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error getting spending data: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 11. validate_claim - Claim coverage and denial risk
server.registerTool(
  "validate_claim",
  {
    description: "Validate coverage, prior-auth requirement, documentation requirements, and denial risk for CPT/HCPCS procedure codes.",
    inputSchema: {
      procedure_codes: z.array(z.string()).min(1).max(10).describe("CPT/HCPCS procedure codes"),
      payer: z.string().optional().describe("Payer or policy source label"),
      plan_type: z.enum(["commercial", "medicare_advantage", "medicaid", "traditional_medicare", "exchange"]).optional(),
      line_of_business: z.string().optional(),
      diagnosis_codes: z.array(z.string()).max(20).optional(),
      modifiers: z.array(z.string()).max(5).optional(),
      state: z.string().length(2).optional(),
      date_of_service: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      site_of_service: z.enum(["office", "outpatient_hospital", "asc", "inpatient", "home", "telehealth"]).optional(),
      provider_specialty: z.string().optional(),
      age_category: z.enum(["pediatric", "adult", "medicare_age"]).optional(),
      sex_when_policy_relevant: z.enum(["female", "male", "other", "unknown"]).optional(),
      idempotency_key: z.string().optional(),
      legacy: z.boolean().default(false).describe("Use deprecated /claim-validation endpoint"),
    },
  },
  async ({ idempotency_key, legacy, ...body }) => {
    try {
      const result = await verityRequest<any>(legacy ? "/claim-validation" : "/claims/validate", {
        method: "POST",
        body,
        headers: idempotency_key ? { "X-Idempotency-Key": idempotency_key } : undefined,
      });
      return { content: [{ type: "text", text: formatClaimValidation(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error validating claim: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 12. research_prior_auth - AI web research
server.registerTool(
  "research_prior_auth",
  {
    description: "Research prior authorization requirements directly from payer websites. Supports async mode or sync completion.",
    inputSchema: {
      procedure_codes: z.array(z.string()).min(1).max(10),
      payer: z.string().optional(),
      state: z.string().length(2).optional(),
      diagnosis_codes: z.array(z.string()).optional(),
      clinical_context: z.string().max(2000).optional(),
      sync: z.boolean().default(false),
    },
  },
  async (body) => {
    try {
      const result = await verityRequest<any>("/prior-auth/research", { method: "POST", body });
      return { content: [{ type: "text", text: formatResearch(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error researching prior auth: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 13. get_prior_auth_research - Poll research task
server.registerTool(
  "get_prior_auth_research",
  {
    description: "Get status and results for a prior authorization research task.",
    inputSchema: {
      research_id: z.string().min(1),
    },
  },
  async ({ research_id }) => {
    try {
      const result = await verityRequest<any>(`/prior-auth/research/${encodeURIComponent(research_id)}`);
      return { content: [{ type: "text", text: formatResearch(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error getting research status: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 14. batch_lookup_codes - Batch medical code lookup
server.registerTool(
  "batch_lookup_codes",
  {
    description: "Look up multiple medical codes in one request. Individual misses return found=false instead of failing the whole batch.",
    inputSchema: {
      codes: z.array(z.string()).min(1).max(50),
      code_system: z.enum(["CPT", "HCPCS", "ICD10CM", "ICD10PCS", "NDC"]).optional(),
      include: z.string().optional().describe("Comma-separated includes, e.g. rvu,policies"),
    },
  },
  async (body) => {
    try {
      const result = await verityRequest<any>("/codes/batch", { method: "POST", body });
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error batch looking up codes: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 15. evaluate_coverage - Evaluate policy criteria
server.registerTool(
  "evaluate_coverage",
  {
    description: "Evaluate a policy's coverage criteria against patient or claim parameters.",
    inputSchema: {
      policy_id: z.string().min(1),
      parameters: z.record(z.unknown()),
    },
  },
  async (body) => {
    try {
      const result = await verityRequest<any>("/coverage/evaluate", { method: "POST", body });
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error evaluating coverage: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 16. list_webhooks - Enterprise webhook endpoints
server.registerTool(
  "list_webhooks",
  {
    description: "List webhook endpoints for the authenticated organization.",
    inputSchema: {},
  },
  async () => {
    try {
      const result = await verityRequest<any>("/webhooks");
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error listing webhooks: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 17. create_webhook - Create webhook endpoint
server.registerTool(
  "create_webhook",
  {
    description: "Create a webhook endpoint. Returns the webhook secret once.",
    inputSchema: {
      url: z.string().url().refine((value) => new URL(value).protocol === "https:", "Webhook URL must use HTTPS"),
      events: z.array(z.string()).min(1),
    },
  },
  async (body) => {
    try {
      const result = await verityRequest<any>("/webhooks", { method: "POST", body });
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error creating webhook: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 18. update_webhook - Update webhook endpoint
server.registerTool(
  "update_webhook",
  {
    description: "Update a webhook endpoint URL, events, or status.",
    inputSchema: {
      id: z.number().int(),
      url: z.string().url().refine((value) => new URL(value).protocol === "https:", "Webhook URL must use HTTPS").optional(),
      events: z.array(z.string()).optional(),
      status: z.enum(["active", "paused"]).optional(),
    },
  },
  async ({ id, url, events, status }) => {
    try {
      const result = await verityRequest<any>(`/webhooks/${id}`, {
        method: "PATCH",
        body: { url, events, status },
      });
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error updating webhook: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 19. delete_webhook - Delete webhook endpoint
server.registerTool(
  "delete_webhook",
  {
    description: "Delete a webhook endpoint.",
    inputSchema: {
      id: z.number().int(),
    },
  },
  async ({ id }) => {
    try {
      const result = await verityRequest<any>(`/webhooks/${id}`, { method: "DELETE" });
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error deleting webhook: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 20. test_webhook - Send test webhook event
server.registerTool(
  "test_webhook",
  {
    description: "Send a test event to a webhook endpoint.",
    inputSchema: {
      id: z.number().int(),
    },
  },
  async ({ id }) => {
    try {
      const result = await verityRequest<any>(`/webhooks/${id}/test`, { method: "POST" });
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error testing webhook: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 21. list_unreviewed_changes - Compliance changes
server.registerTool(
  "list_unreviewed_changes",
  {
    description: "List policy changes not yet acknowledged by the authenticated organization.",
    inputSchema: {
      change_type: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    },
  },
  async ({ change_type, cursor, limit }) => {
    try {
      const result = await verityRequest<any>("/compliance/unreviewed", {
        params: { change_type, cursor, limit },
      });
      return { content: [{ type: "text", text: formatJson({ data: result.data, meta: result.meta }) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error listing unreviewed changes: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 22. acknowledge_change - Acknowledge one compliance change
server.registerTool(
  "acknowledge_change",
  {
    description: "Acknowledge a single policy change.",
    inputSchema: {
      diff_id: z.number().int(),
      notes: z.string().max(500).optional(),
    },
  },
  async (body) => {
    try {
      const result = await verityRequest<any>("/compliance/ack", { method: "POST", body });
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error acknowledging change: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 23. bulk_acknowledge_changes - Acknowledge many compliance changes
server.registerTool(
  "bulk_acknowledge_changes",
  {
    description: "Acknowledge multiple policy changes.",
    inputSchema: {
      diff_ids: z.array(z.number().int()).min(1).max(200),
      notes: z.string().max(500).optional(),
    },
  },
  async (body) => {
    try {
      const result = await verityRequest<any>("/compliance/ack/bulk", { method: "POST", body });
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error bulk acknowledging changes: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 24. get_compliance_stats - Compliance dashboard stats
server.registerTool(
  "get_compliance_stats",
  {
    description: "Get compliance dashboard statistics for the authenticated organization.",
    inputSchema: {},
  },
  async () => {
    try {
      const result = await verityRequest<any>("/compliance/stats");
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error getting compliance stats: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

// 25. search_drug_formulary_evidence - Drug formulary evidence
server.registerTool(
  "search_drug_formulary_evidence",
  {
    description: "Search commercial pharmacy-benefit evidence from CVS Caremark, Express Scripts, and UnitedHealthcare / Optum Rx.",
    inputSchema: {
      query: z.string().min(2).max(200),
      payer: z.enum(["all", "cvs_caremark", "express_scripts", "uhc"]).default("all"),
      limit: z.number().int().min(1).max(100).default(25),
    },
  },
  async ({ query, payer, limit }) => {
    try {
      const result = await verityRequest<any>("/drugs/formulary", {
        params: { q: query, payer, limit },
      });
      return { content: [{ type: "text", text: formatJson(result.data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error searching drug formulary: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

return server;
}

function setHttpHeaders(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", responseOrigin(req));
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.setHeader("Vary", "Origin");
}

function sendJson(req: IncomingMessage, res: ServerResponse, status: number, body: unknown): void {
  setHttpHeaders(req, res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function extractBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;

  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim();
}

function resolveHttpApiKey(req: IncomingMessage): string | undefined {
  const bearerToken = extractBearerToken(req);
  if (bearerToken) return bearerToken;
  if (!allowEnvKeyForHttp || !process.env.VERITY_API_KEY) return undefined;

  const requestHost = normalizeHost(req.headers.host);
  return requestHost && isPrivateHost(httpHost) && isPrivateHost(requestHost) ? process.env.VERITY_API_KEY : undefined;
}

async function readRequestBody(req: IncomingMessage): Promise<unknown> {
  const requestWithBody = req as IncomingMessage & { body?: unknown };
  const contentType = Array.isArray(req.headers["content-type"]) ? req.headers["content-type"].join(",") : req.headers["content-type"] || "";
  if (requestWithBody.body !== undefined) {
    if (typeof requestWithBody.body === "string" && contentType.toLowerCase().includes("application/json")) {
      return JSON.parse(requestWithBody.body);
    }
    return requestWithBody.body;
  }
  if (req.method !== "POST") return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody.trim()) return undefined;

  if (!contentType.toLowerCase().includes("application/json")) return rawBody;

  return JSON.parse(rawBody);
}

function isInvalidJsonError(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof Error && error.message.toLowerCase().includes("invalid json"));
}

function rejectUnsafeHttpRequest(req: IncomingMessage, res: ServerResponse): boolean {
  setHttpHeaders(req, res);

  if (req.method === "OPTIONS") {
    if (!isAllowedHost(req)) {
      sendJson(req, res, 421, {
        error: "host_not_allowed",
        message: "Configure VERITY_MCP_ALLOWED_HOSTS or VERITY_MCP_PUBLIC_HOST to allow this Host.",
      });
      return true;
    }

    if (!isAllowedOrigin(req)) {
      sendJson(req, res, 403, {
        error: "origin_not_allowed",
        message: "Configure VERITY_MCP_ALLOWED_ORIGINS to allow this Origin.",
      });
      return true;
    }

    res.writeHead(204);
    res.end();
    return true;
  }

  if (!isAllowedHost(req)) {
    sendJson(req, res, 421, {
      error: "host_not_allowed",
      message: "Configure VERITY_MCP_ALLOWED_HOSTS or VERITY_MCP_PUBLIC_HOST to allow this Host.",
    });
    return true;
  }

  if (!isAllowedOrigin(req)) {
    sendJson(req, res, 403, {
      error: "origin_not_allowed",
      message: "Configure VERITY_MCP_ALLOWED_ORIGINS to allow this Origin.",
    });
    return true;
  }

  return false;
}

export function handleHealthRequest(req: IncomingMessage, res: ServerResponse): void {
  if (rejectUnsafeHttpRequest(req, res)) return;

  if (req.method !== "GET") {
    sendJson(req, res, 405, {
      error: "method_not_allowed",
      message: "Use GET for the health endpoint.",
    });
    return;
  }

  sendJson(req, res, 200, {
    status: "ok",
    transport: "streamable-http",
    mcp_path: httpPath,
  });
}

export function handleRootRequest(req: IncomingMessage, res: ServerResponse): void {
  if (rejectUnsafeHttpRequest(req, res)) return;

  if (req.method !== "GET") {
    sendJson(req, res, 405, {
      error: "method_not_allowed",
      message: "Use GET for this endpoint.",
    });
    return;
  }

  sendJson(req, res, 200, {
    name: "verity-mcp",
    transport: "streamable-http",
    mcp_url: httpPath,
    authentication: "Send Authorization: Bearer <VERITY_API_KEY> with each MCP request.",
  });
}

export async function handleMcpEndpointRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (rejectUnsafeHttpRequest(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    sendJson(req, res, 405, {
      error: "method_not_allowed",
      message: "Use POST for stateless Streamable HTTP MCP requests.",
    });
    return;
  }

  const apiKey = resolveHttpApiKey(req);
  if (!apiKey) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="Verity MCP", error="invalid_token"');
    sendJson(req, res, 401, {
      error: "missing_bearer_token",
      message: "Send Authorization: Bearer <VERITY_API_KEY> with the MCP request.",
    });
    return;
  }

  const authenticatedReq = req as AuthenticatedIncomingMessage;
  authenticatedReq.auth = {
    token: apiKey,
    clientId: "verity-api-key",
    scopes: [],
  };

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
  });

  try {
    const body = await readRequestBody(authenticatedReq);
    const server = createVerityMcpServer();
    await server.connect(transport);
    await requestApiKey.run(apiKey, () => transport.handleRequest(authenticatedReq, res, body));
  } catch (error) {
    if (!isInvalidJsonError(error)) {
      console.error("Error handling MCP HTTP request:", error);
    }
    if (!res.headersSent) {
      if (isInvalidJsonError(error)) {
        sendJson(req, res, 400, {
          error: "invalid_json",
          message: "MCP request body must be valid JSON.",
        });
      } else {
        sendJson(req, res, 500, {
          error: "mcp_request_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      res.end();
    }
  }
}

export async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    handleHealthRequest(req, res);
    return;
  }

  if (url.pathname === "/") {
    handleRootRequest(req, res);
    return;
  }

  if (url.pathname !== httpPath) {
    if (rejectUnsafeHttpRequest(req, res)) return;
    sendJson(req, res, 404, {
      error: "not_found",
      message: `Use ${httpPath} for MCP Streamable HTTP requests.`,
    });
    return;
  }

  await handleMcpEndpointRequest(req, res);
}

async function startStdioServer(): Promise<void> {
  if (!process.env.VERITY_API_KEY) {
    console.error("Error: VERITY_API_KEY environment variable is required for stdio transport");
    console.error("Set it with: export VERITY_API_KEY=vrt_live_YOUR_KEY_HERE");
    process.exit(1);
  }

  const server = createVerityMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Verity MCP Server running on stdio");
}

async function startHttpServer(): Promise<void> {
  if (!Number.isInteger(httpPort) || httpPort <= 0 || httpPort > 65535) {
    throw new Error(`Invalid HTTP port: ${httpPort}`);
  }

  const httpServer = createServer(handleHttpRequest);

  httpServer.listen(httpPort, httpHost, () => {
    console.error(`Verity MCP Server running on Streamable HTTP: http://${httpHost}:${httpPort}${httpPath}`);
  });
}

// Main entry point
async function main() {
  if (shouldShowHelp) {
    printHelp();
    return;
  }

  if (transportMode === "http") {
    await startHttpServer();
    return;
  }

  if (transportMode !== "stdio") {
    throw new Error(`Unknown transport "${transportMode}". Use "stdio" or "http".`);
  }

  await startStdioServer();
}

function realEntrypointUrl(path: string): string {
  try {
    return pathToFileURL(realpathSync(path)).href;
  } catch {
    return pathToFileURL(path).href;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
const realEntrypoint = process.argv[1] ? realEntrypointUrl(process.argv[1]) : undefined;
if (entrypoint === import.meta.url || realEntrypoint === import.meta.url) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}
