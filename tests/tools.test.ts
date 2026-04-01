import { describe, it, expect } from "vitest";
import type { DataProvider, Agent, Deployment, ProtocolMetrics, Article } from "../src/data/types.js";

import { discoverAgents } from "../src/tools/discover-agents.js";
import { checkProtocolSupport } from "../src/tools/check-protocol-support.js";
import { getProtocolMetrics } from "../src/tools/get-protocol-metrics.js";
import { findDeployments } from "../src/tools/find-deployments.js";
import { getCompatibilityTool } from "../src/tools/get-compatibility.js";
import { recommendStack } from "../src/tools/recommend-stack.js";
import { getMarketNews } from "../src/tools/get-market-news.js";

// ===== Mock Data =====

const mockAgents: Agent[] = [
  {
    name: "AdCP Protocol Server",
    icon: "📋",
    category: "infra",
    version: "v2.0",
    status: "live",
    featured: true,
    protocols: ["AdCP", "MCP"],
    steward: "AgenticAdvertising.org",
    description: "Reference implementation of AdCP",
    tags: ["adcp"],
    link: "https://github.com/adcontextprotocol/adcp",
  },
  {
    name: "Prebid Sales Agent",
    icon: "🏷️",
    category: "media",
    version: "v1.0",
    status: "live",
    featured: true,
    protocols: ["AdCP", "MCP", "A2A"],
    steward: "Prebid.org",
    description: "Publisher-side sales automation",
    tags: ["prebid"],
    link: "https://github.com/prebid/salesagent",
  },
];

const mockDeployments: Deployment[] = [
  { company: "PubMatic", protocol: "AdCP", country: "US", region: "North America", category: "Media Trading", use_case: "AgenticOS platform", announced_date: "2025-10-15" },
  { company: "PubMatic", protocol: "MCP",  country: "US", region: "North America", category: "Media Trading", use_case: "MCP server",         announced_date: "2025-12-01" },
  { company: "Equativ",  protocol: "MCP",  country: "FR", region: "Europe",         category: "Media Trading", use_case: "SSP MCP server",     announced_date: "2025-12-01" },
  { company: "PubMatic", protocol: "AdCP", country: "FR", region: "Europe",         category: "Media Trading", use_case: "First French campaign", announced_date: "2026-03-15" },
];

const mockMetrics: ProtocolMetrics[] = [
  { protocol: "MCP",  github_stars: 7685, npm_weekly_downloads: 44893137, pypi_weekly_downloads: 0, github_contributors: 340, github_commits_30d: 333, maturity: "Stable", momentum_30d_pct: 12,  date: "2026-04-01" },
  { protocol: "AdCP", github_stars: 199,  npm_weekly_downloads: 1465,     pypi_weekly_downloads: 0, github_contributors: 16,  github_commits_30d: 410, maturity: "Beta",   momentum_30d_pct: 34,  date: "2026-04-01" },
];

const mockArticles: Article[] = [
  { title: "AdCP v3.0 Beta Released", source: "AdExchanger", url: "https://example.com/1", category: "Infrastructure", protocols: ["AdCP"], published: "2026-03-28" },
  { title: "MCP Hits 97M Downloads",  source: "TechCrunch",  url: "https://example.com/2", category: "Infrastructure", protocols: ["MCP"], published: "2026-03-25" },
];

// ===== Mock Provider =====

const mockProvider: DataProvider = {
  getAgents: (opts) => {
    let result = [...mockAgents];
    if (opts?.protocol) result = result.filter(a => a.protocols.includes(opts.protocol!));
    if (opts?.category) result = result.filter(a => a.category === opts.category);
    if (opts?.status)   result = result.filter(a => a.status === opts.status);
    if (opts?.query)    result = result.filter(a =>
      a.name.toLowerCase().includes(opts.query!.toLowerCase()) ||
      a.description.toLowerCase().includes(opts.query!.toLowerCase())
    );
    return result;
  },
  getDeployments: (opts) => {
    let result = [...mockDeployments];
    if (opts?.protocol) result = result.filter(d => d.protocol === opts.protocol);
    if (opts?.country)  result = result.filter(d => d.country === opts.country);
    if (opts?.category) result = result.filter(d => d.category === opts.category);
    if (opts?.search)   result = result.filter(d => d.company.toLowerCase().includes(opts.search!.toLowerCase()));
    const total = result.length;
    if (opts?.limit)    result = result.slice(0, opts.limit);
    return { deployments: result, total };
  },
  getMetrics: (protocol) => {
    if (protocol) return mockMetrics.filter(m => m.protocol === protocol);
    return mockMetrics;
  },
  getArticles: (opts) => {
    let result = [...mockArticles];
    if (opts?.protocol) result = result.filter(a => a.protocols.includes(opts.protocol!));
    if (opts?.category) result = result.filter(a => a.category === opts.category);
    if (opts?.limit)    result = result.slice(0, opts.limit);
    return result;
  },
  getDataTimestamp: () => "2026-04-01T04:00:00Z",
};

// ===== Tests =====

describe("discoverAgents", () => {
  it("returns all agents when no filter", () => {
    const result = discoverAgents(mockProvider, {});
    expect(result.count).toBe(2);
    expect(result.data_as_of).toBe("2026-04-01T04:00:00Z");
  });

  it("filters by protocol", () => {
    const result = discoverAgents(mockProvider, { protocol: "A2A" });
    expect(result.count).toBe(1);
    expect(result.agents[0].name).toBe("Prebid Sales Agent");
  });

  it("filters by category", () => {
    const result = discoverAgents(mockProvider, { category: "infra" });
    expect(result.count).toBe(1);
    expect(result.agents[0].name).toBe("AdCP Protocol Server");
  });

  it("filters by query", () => {
    const result = discoverAgents(mockProvider, { query: "prebid" });
    expect(result.count).toBe(1);
  });

  it("strips icon, featured, tags from output", () => {
    const result = discoverAgents(mockProvider, {});
    const agent = result.agents[0] as Record<string, unknown>;
    expect(agent["icon"]).toBeUndefined();
    expect(agent["featured"]).toBeUndefined();
    expect(agent["tags"]).toBeUndefined();
  });
});

describe("checkProtocolSupport", () => {
  it("returns protocols for PubMatic", () => {
    const result = checkProtocolSupport(mockProvider, { company: "PubMatic" });
    expect(result.company).toBe("PubMatic");
    expect(result.total_protocols).toBeGreaterThanOrEqual(2);
    const protocols = result.protocols.map(p => p.protocol);
    expect(protocols).toContain("AdCP");
    expect(protocols).toContain("MCP");
  });

  it("returns empty for unknown company", () => {
    const result = checkProtocolSupport(mockProvider, { company: "UnknownCorp" });
    expect(result.total_protocols).toBe(0);
    expect(result.protocols).toHaveLength(0);
  });

  it("deduplicates protocols", () => {
    // PubMatic has AdCP twice (US + FR) — should appear only once
    const result = checkProtocolSupport(mockProvider, { company: "PubMatic" });
    const adcpEntries = result.protocols.filter(p => p.protocol === "AdCP");
    expect(adcpEntries).toHaveLength(1);
  });

  it("includes use_case and announced_date", () => {
    const result = checkProtocolSupport(mockProvider, { company: "Equativ" });
    expect(result.protocols[0].use_case).toBe("SSP MCP server");
    expect(result.protocols[0].announced_date).toBe("2025-12-01");
  });

  it("includes data_as_of", () => {
    const result = checkProtocolSupport(mockProvider, { company: "Equativ" });
    expect(result.data_as_of).toBe("2026-04-01T04:00:00Z");
  });
});

describe("getProtocolMetrics", () => {
  it("returns all metrics", () => {
    const result = getProtocolMetrics(mockProvider, {});
    expect(result.metrics.length).toBe(2);
  });

  it("filters by protocol", () => {
    const result = getProtocolMetrics(mockProvider, { protocol: "MCP" });
    expect(result.metrics.length).toBe(1);
    expect(result.metrics[0].github_stars).toBe(7685);
  });

  it("maps github_contributors to contributors", () => {
    const result = getProtocolMetrics(mockProvider, { protocol: "MCP" });
    expect(result.metrics[0].contributors).toBe(340);
  });

  it("includes momentum_30d_pct", () => {
    const result = getProtocolMetrics(mockProvider, { protocol: "AdCP" });
    expect(result.metrics[0].momentum_30d_pct).toBe(34);
  });

  it("includes data_as_of", () => {
    const result = getProtocolMetrics(mockProvider, {});
    expect(result.data_as_of).toBe("2026-04-01T04:00:00Z");
  });
});

describe("findDeployments", () => {
  it("returns all deployments with no filter", () => {
    const result = findDeployments(mockProvider, {});
    expect(result.total).toBe(4);
  });

  it("filters by country", () => {
    const result = findDeployments(mockProvider, { country: "FR" });
    expect(result.total).toBe(2);
    expect(result.deployments.every(d => d.country === "FR")).toBe(true);
  });

  it("filters by protocol", () => {
    const result = findDeployments(mockProvider, { protocol: "AdCP" });
    expect(result.total).toBe(2);
  });

  it("respects limit", () => {
    const result = findDeployments(mockProvider, { limit: 2 });
    expect(result.deployments.length).toBe(2);
    expect(result.total).toBe(4);
  });

  it("includes data_as_of", () => {
    const result = findDeployments(mockProvider, {});
    expect(result.data_as_of).toBe("2026-04-01T04:00:00Z");
  });
});

describe("getCompatibilityTool", () => {
  it("returns native for AdCP + MCP", () => {
    const result = getCompatibilityTool(mockProvider, { protocol_a: "AdCP", protocol_b: "MCP" });
    expect(result.compatible).toBe(true);
    expect(result.relationship).toBe("native");
  });

  it("is order-independent", () => {
    const ab = getCompatibilityTool(mockProvider, { protocol_a: "AdCP", protocol_b: "MCP" });
    const ba = getCompatibilityTool(mockProvider, { protocol_a: "MCP", protocol_b: "AdCP" });
    expect(ab.relationship).toBe(ba.relationship);
    expect(ab.compatible).toBe(ba.compatible);
  });

  it("returns complementary for A2A + MCP", () => {
    const result = getCompatibilityTool(mockProvider, { protocol_a: "A2A", protocol_b: "MCP" });
    expect(result.relationship).toBe("complementary");
  });

  it("returns no_direct_bridge for unknown pair", () => {
    const result = getCompatibilityTool(mockProvider, { protocol_a: "FooBar", protocol_b: "MCP" });
    expect(result.compatible).toBe(false);
    expect(result.relationship).toBe("no_direct_bridge");
  });

  it("includes data_as_of", () => {
    const result = getCompatibilityTool(mockProvider, { protocol_a: "AdCP", protocol_b: "MCP" });
    expect(result.data_as_of).toBe("2026-04-01T04:00:00Z");
  });
});

describe("recommendStack", () => {
  it("recommends for France market", () => {
    const result = recommendStack(mockProvider, { goal: "programmatic campaign", market: "France" });
    expect(result.market_coverage.deployments_in_market).toBeGreaterThan(0);
    expect(result.suggested_protocols.length).toBeGreaterThan(0);
    expect(result.data_as_of).toBe("2026-04-01T04:00:00Z");
  });

  it("resolves country name to ISO code", () => {
    const france = recommendStack(mockProvider, { goal: "test", market: "France" });
    const fr = recommendStack(mockProvider, { goal: "test", market: "FR" });
    // Both should find the same FR deployments
    expect(france.market_coverage.deployments_in_market).toBe(fr.market_coverage.deployments_in_market);
  });

  it("returns top protocol sorted by deployment count", () => {
    const result = recommendStack(mockProvider, { goal: "test", market: "France" });
    // FR has 2 deployments: AdCP x1, MCP x1 — should be consistent
    expect(result.market_coverage.top_protocol).toBeTruthy();
  });

  it("filters agents by category when specified", () => {
    const result = recommendStack(mockProvider, { goal: "test", category: "infra" });
    expect(result.suggested_agents.every(a => a.category === "infra")).toBe(true);
  });

  it("includes reasoning string", () => {
    const result = recommendStack(mockProvider, { goal: "programmatic campaign", market: "France" });
    expect(result.reasoning.length).toBeGreaterThan(10);
  });

  it("includes recommendation string mentioning goal", () => {
    const result = recommendStack(mockProvider, { goal: "programmatic campaign", market: "France" });
    expect(result.recommendation).toContain("programmatic campaign");
  });

  it("handles global market (no market filter)", () => {
    const result = recommendStack(mockProvider, { goal: "global test" });
    expect(result.market_coverage.deployments_in_market).toBe(4);
  });
});

describe("getMarketNews", () => {
  it("returns all articles with no filter", () => {
    const result = getMarketNews(mockProvider, {});
    expect(result.count).toBe(2);
  });

  it("returns articles filtered by protocol", () => {
    const result = getMarketNews(mockProvider, { protocol: "AdCP" });
    expect(result.count).toBe(1);
    expect(result.articles[0].title).toContain("AdCP");
  });

  it("respects limit", () => {
    const result = getMarketNews(mockProvider, { limit: 1 });
    expect(result.articles.length).toBe(1);
    expect(result.count).toBe(1);
  });

  it("includes data_as_of", () => {
    const result = getMarketNews(mockProvider, {});
    expect(result.data_as_of).toBe("2026-04-01T04:00:00Z");
  });

  it("filters by category", () => {
    const result = getMarketNews(mockProvider, { category: "Infrastructure" });
    expect(result.count).toBe(2);
  });
});
