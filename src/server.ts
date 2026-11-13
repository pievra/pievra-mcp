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
import { supplyBuyingRoutes, supplyCheckSeller, supplyLookupSite, supplyMarkets } from "./tools/supply.js";

export function createServer(provider: DataProvider): McpServer {
  const server = new McpServer({ name: "pievra", version: "0.1.0" });

  server.tool(
    "discover_agents",
    "Find AI agents in the Pievra agentic advertising marketplace by protocol, category, or status",
    {
      protocol: z.string().optional().describe("Protocol filter: AdCP, MCP, A2A, ARTF, Agentic Audiences"),
      category: z.string().optional().describe("Category: infra, media, data, creative, measure"),
      status: z.string().optional().describe("Status: live or beta"),
      query: z.string().optional().describe("Free-text search across agent names and descriptions"),
    },
    async (input) => {
      const result = discoverAgents(provider, input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "check_protocol_support",
    "Look up which agentic advertising protocols a company supports",
    {
      company: z.string().describe("Company name to look up"),
    },
    async (input) => {
      const result = checkProtocolSupport(provider, input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_protocol_metrics",
    "Get live adoption metrics (GitHub stars, npm downloads, contributors) for agentic advertising protocols",
    {
      protocol: z.string().optional().describe("Protocol name, omit for all"),
    },
    async (input) => {
      const result = getProtocolMetrics(provider, input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "find_deployments",
    "Search the deployment directory of companies using agentic advertising protocols",
    {
      protocol: z.string().optional().describe("Protocol filter: AdCP, MCP, A2A, ARTF, Agentic Audiences"),
      country: z.string().optional().describe("ISO 3166-1 alpha-2 code"),
      category: z.string().optional().describe("Category: infra, media, data, creative, measure"),
      search: z.string().optional().describe("Company name search"),
      limit: z.number().optional().describe("Max results, default 20"),
    },
    async (input) => {
      const result = findDeployments(provider, input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_compatibility",
    "Check if two agentic advertising protocols can interoperate and how",
    {
      protocol_a: z.string().describe("First protocol"),
      protocol_b: z.string().describe("Second protocol"),
    },
    async (input) => {
      const result = getCompatibilityTool(provider, input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "recommend_stack",
    "Get a recommended stack of agents and protocols for an advertising campaign goal",
    {
      goal: z.string().describe("Campaign goal, e.g. programmatic CTV campaign"),
      market: z.string().optional().describe("Target market, e.g. France, US"),
      budget: z.string().optional().describe("Budget, e.g. 50K EUR"),
      category: z.string().optional().describe("Category focus"),
    },
    async (input) => {
      const result = recommendStack(provider, input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_market_news",
    "Get latest news about agentic advertising protocols",
    {
      protocol: z.string().optional().describe("Protocol filter: AdCP, MCP, A2A, ARTF, Agentic Audiences"),
      category: z.string().optional().describe("Category filter"),
      days: z.number().optional().describe("Look back days, default 7"),
      limit: z.number().optional().describe("Max articles, default 10"),
    },
    async (input) => {
      const result = getMarketNews(provider, input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  const asText = (result: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] });

  server.tool(
    "supply_list_markets",
    "List the markets in the Pievra Supply Atlas with how many sites and apps are tracked and graded, and the most-named ad systems in each",
    {},
    async () => asText(await supplyMarkets()),
  );

  server.tool(
    "supply_lookup_site",
    "Look up a website or app developer domain in the Pievra Supply Atlas: its supply path grade (A to D), score, and the ad systems that hold a confirmed direct route to it",
    {
      domain: z.string().describe("Site or developer domain, for example lemonde.fr"),
    },
    async (input) => asText(await supplyLookupSite(input)),
  );

  server.tool(
    "supply_check_seller",
    "Check whether an ad system (and optionally one seller account) is authorised to sell a domain's ad space according to its ads.txt or app-ads.txt, and whether the ad system's sellers.json confirms it",
    {
      domain: z.string().describe("Site or developer domain, for example lemonde.fr"),
      ad_system: z.string().describe("Ad system domain as written in ads.txt, for example google.com"),
      seller_id: z.string().optional().describe("Seller account id to check, omit to list every line for the ad system"),
    },
    async (input) => asText(await supplyCheckSeller(input)),
  );

  server.tool(
    "supply_buying_routes",
    "Get the shortest list of ad systems that reaches a market's graded sites or apps through the publisher's own confirmed account, for supply path optimisation",
    {
      market: z.string().describe("Market code: fr, gb, de, es, it, us, br, sa, ae or eg"),
      kind: z.string().optional().describe("site or app_ios; omit for both"),
    },
    async (input) => asText(await supplyBuyingRoutes(input)),
  );

  return server;
}
