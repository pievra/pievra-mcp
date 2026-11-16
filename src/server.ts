import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DataProvider } from "./data/types.js";
import { discoverAgents } from "./tools/discover-agents.js";
import { checkProtocolSupport } from "./tools/check-protocol-support.js";
import { getProtocolMetrics } from "./tools/get-protocol-metrics.js";
import { findDeployments } from "./tools/find-deployments.js";
import { getCompatibilityTool } from "./tools/get-compatibility.js";
import { recommendStack } from "./tools/recommend-stack.js";
import { getMarketNews } from "./tools/get-market-news.js";
import { supplyBuyingRoutes, supplyCheckSeller, supplyLookupSite, supplyMarkets, type SupplyOptions } from "./tools/supply.js";
import { asData, DEFAULT_MAX_RESULT_BYTES, type ToolText } from "./envelope.js";
import type { Fetcher } from "./net.js";

export type ServerOptions = {
  /** HTTP client of the supply tools; tests inject a fake one. */
  fetcher?: Fetcher;
  /** Deadline and size cap of the supply calls. */
  supply?: SupplyOptions;
  /** Cap on the text of one tool answer. */
  maxResultBytes?: number;
};

// ---- Input rules, shared by every tool -------------------------------------------------
// Each field is bounded: a length for free text, a closed list or a pattern for codes.
// A value outside the rule is refused by the SDK before the tool runs (JSON-RPC -32602).

const text = (max: number) => z.string().trim().min(1).max(max);
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export const fields = {
  protocol: text(40),
  category: text(60),
  status: text(20),
  query: text(200),
  company: text(200),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/, "two letter country code"),
  limit: z.number().int().min(1).max(100),
  days: z.number().int().min(1).max(365),
  goal: text(500),
  market: text(100),
  budget: text(100),
  domain: z.string().trim().toLowerCase().regex(HOSTNAME, "a host name such as lemonde.fr"),
  sellerId: z.string().trim().regex(/^[\x21-\x7e]{1,128}$/, "1 to 128 printable characters, no space"),
  marketCode: z.string().trim().toLowerCase().regex(/^[a-z]{2}$/, "two letter market code"),
  kind: z.enum(["site", "app_ios", "app"]),
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const ORIGIN_INDEX = "Pievra index (registries, public repositories, news feeds)";
const ORIGIN_ATLAS = "Pievra Supply Atlas (publishers' ads.txt and app-ads.txt, exchanges' sellers.json)";

export function createServer(provider: DataProvider, opts: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: "pievra", version: "0.1.0" });
  const cap = opts.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES;
  const fetcher: Fetcher = opts.fetcher ?? fetch;

  /** Runs a tool, wraps its answer as data, and never lets an internal message reach the client. */
  const run = async (tool: string, origin: string, work: () => unknown | Promise<unknown>): Promise<ToolText> => {
    try {
      return asData(tool, origin, await work(), cap);
    } catch (e) {
      console.error(`[pievra-mcp] tool ${tool} failed:`, e instanceof Error ? e.message : e);
      const failed = asData(tool, origin, { error: "internal_error", detail: "The tool could not complete the request." }, cap);
      return { ...failed, isError: true };
    }
  };

  server.registerTool(
    "discover_agents",
    {
      description: "Find AI agents in the Pievra agentic advertising marketplace by protocol, category, or status",
      inputSchema: {
        protocol: fields.protocol.optional().describe("Protocol filter: AdCP, MCP, A2A, ARTF, Agentic Audiences"),
        category: fields.category.optional().describe("Category: infra, media, data, creative, measure"),
        status: fields.status.optional().describe("Status: live or beta"),
        query: fields.query.optional().describe("Free-text search across agent names and descriptions"),
      },
      annotations: READ_ONLY,
    },
    (input) => run("discover_agents", ORIGIN_INDEX, () => discoverAgents(provider, input)),
  );

  server.registerTool(
    "check_protocol_support",
    {
      description: "Look up which agentic advertising protocols a company supports",
      inputSchema: { company: fields.company.describe("Company name to look up") },
      annotations: READ_ONLY,
    },
    (input) => run("check_protocol_support", ORIGIN_INDEX, () => checkProtocolSupport(provider, input)),
  );

  server.registerTool(
    "get_protocol_metrics",
    {
      description: "Get live adoption metrics (GitHub stars, npm downloads, contributors) for agentic advertising protocols",
      inputSchema: { protocol: fields.protocol.optional().describe("Protocol name, omit for all") },
      annotations: READ_ONLY,
    },
    (input) => run("get_protocol_metrics", ORIGIN_INDEX, () => getProtocolMetrics(provider, input)),
  );

  server.registerTool(
    "find_deployments",
    {
      description: "Search the deployment directory of companies using agentic advertising protocols",
      inputSchema: {
        protocol: fields.protocol.optional().describe("Protocol filter: AdCP, MCP, A2A, ARTF, Agentic Audiences"),
        country: fields.country.optional().describe("ISO 3166-1 alpha-2 code"),
        category: fields.category.optional().describe("Category: infra, media, data, creative, measure"),
        search: fields.query.optional().describe("Company name search"),
        limit: fields.limit.optional().describe("Max results, 1 to 100, default 20"),
      },
      annotations: READ_ONLY,
    },
    (input) => run("find_deployments", ORIGIN_INDEX, () => findDeployments(provider, input)),
  );

  server.registerTool(
    "get_compatibility",
    {
      description: "Check if two agentic advertising protocols can interoperate and how",
      inputSchema: {
        protocol_a: fields.protocol.describe("First protocol"),
        protocol_b: fields.protocol.describe("Second protocol"),
      },
      annotations: READ_ONLY,
    },
    (input) => run("get_compatibility", ORIGIN_INDEX, () => getCompatibilityTool(provider, input)),
  );

  server.registerTool(
    "recommend_stack",
    {
      description: "Get a recommended stack of agents and protocols for an advertising campaign goal",
      inputSchema: {
        goal: fields.goal.describe("Campaign goal, e.g. programmatic CTV campaign"),
        market: fields.market.optional().describe("Target market, e.g. France, US"),
        budget: fields.budget.optional().describe("Budget, e.g. 50K EUR"),
        category: fields.category.optional().describe("Category focus"),
      },
      annotations: READ_ONLY,
    },
    (input) => run("recommend_stack", ORIGIN_INDEX, () => recommendStack(provider, input)),
  );

  server.registerTool(
    "get_market_news",
    {
      description: "Get latest news about agentic advertising protocols",
      inputSchema: {
        protocol: fields.protocol.optional().describe("Protocol filter: AdCP, MCP, A2A, ARTF, Agentic Audiences"),
        category: fields.category.optional().describe("Category filter"),
        days: fields.days.optional().describe("Look back days, 1 to 365, default 7"),
        limit: fields.limit.optional().describe("Max articles, 1 to 100 (the server returns 50 at most), default 10"),
      },
      annotations: READ_ONLY,
    },
    (input) => run("get_market_news", ORIGIN_INDEX, () => getMarketNews(provider, input)),
  );

  const OPEN_WORLD = { ...READ_ONLY, openWorldHint: true } as const;

  server.registerTool(
    "supply_list_markets",
    {
      description: "List the markets in the Pievra Supply Atlas with how many sites and apps are tracked and graded, and the most-named ad systems in each",
      inputSchema: {},
      annotations: OPEN_WORLD,
    },
    () => run("supply_list_markets", ORIGIN_ATLAS, () => supplyMarkets(fetcher, opts.supply)),
  );

  server.registerTool(
    "supply_lookup_site",
    {
      description: "Look up a website or app developer domain in the Pievra Supply Atlas: its supply path grade (A to D), score, and the ad systems that hold a confirmed direct route to it",
      inputSchema: { domain: fields.domain.describe("Site or developer domain, for example lemonde.fr") },
      annotations: OPEN_WORLD,
    },
    (input) => run("supply_lookup_site", ORIGIN_ATLAS, () => supplyLookupSite(input, fetcher, opts.supply)),
  );

  server.registerTool(
    "supply_check_seller",
    {
      description: "Check whether an ad system (and optionally one seller account) is authorised to sell a domain's ad space according to its ads.txt or app-ads.txt, and whether the ad system's sellers.json confirms it",
      inputSchema: {
        domain: fields.domain.describe("Site or developer domain, for example lemonde.fr"),
        ad_system: fields.domain.describe("Ad system domain as written in ads.txt, for example google.com"),
        seller_id: fields.sellerId.optional().describe("Seller account id to check, omit to list every line for the ad system"),
      },
      annotations: OPEN_WORLD,
    },
    (input) => run("supply_check_seller", ORIGIN_ATLAS, () => supplyCheckSeller(input, fetcher, opts.supply)),
  );

  server.registerTool(
    "supply_buying_routes",
    {
      description: "Get the shortest list of ad systems that reaches a market's graded sites or apps through the publisher's own confirmed account, for supply path optimisation",
      inputSchema: {
        market: fields.marketCode.describe("Market code: fr, gb, de, es, it, us, br, sa, ae or eg"),
        kind: fields.kind.optional().describe("site or app_ios (app is accepted as app_ios); omit for both"),
      },
      annotations: OPEN_WORLD,
    },
    (input) => run("supply_buying_routes", ORIGIN_ATLAS, () => supplyBuyingRoutes(input, fetcher, opts.supply)),
  );

  return server;
}
