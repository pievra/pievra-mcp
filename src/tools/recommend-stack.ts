import type { DataProvider } from "../data/types.js";

type Input = {
  goal: string;
  market?: string;
  budget?: string;
  category?: string;
};

type Output = {
  suggested_protocols: Array<{ protocol: string; deployment_count: number; github_stars: number }>;
  suggested_agents: Array<{ name: string; protocols: string[]; category: string; description: string; role: string }>;
  recommendation: string;
  reasoning: string;
  market_coverage: { deployments_in_market: number; top_protocol: string | null };
  data_as_of: string;
};

const COUNTRY_MAP: Record<string, string> = {
  "france": "FR",
  "germany": "DE",
  "united states": "US",
  "us": "US",
  "uk": "GB",
  "united kingdom": "GB",
  "canada": "CA",
  "india": "IN",
  "australia": "AU",
  "japan": "JP",
  "israel": "IL",
  "spain": "ES",
  "italy": "IT",
  "netherlands": "NL",
  "brazil": "BR",
  "singapore": "SG",
  "sweden": "SE",
  "ireland": "IE",
};

function resolveCountryCode(market?: string): string | undefined {
  if (!market) return undefined;
  const normalized = market.toLowerCase().trim();
  return COUNTRY_MAP[normalized] ?? market.toUpperCase();
}

function roleForCategory(category: string): string {
  switch (category) {
    case "infra": return "protocol infrastructure and server implementation";
    case "media": return "media buying and publisher-side operations";
    case "data": return "audience data and signal processing";
    case "creative": return "creative generation and optimization";
    case "measurement": return "campaign measurement and attribution";
    default: return "general agentic advertising tasks";
  }
}

export function recommendStack(provider: DataProvider, input: Input): Output {
  const countryCode = resolveCountryCode(input.market);

  // Get all deployments, then filter by market for counting
  const { deployments: allDeployments } = provider.getDeployments({});
  const marketDeployments = countryCode
    ? allDeployments.filter(d => d.country === countryCode)
    : allDeployments;

  // Count deployments per protocol in market
  const protocolCounts = new Map<string, number>();
  for (const d of marketDeployments) {
    protocolCounts.set(d.protocol, (protocolCounts.get(d.protocol) ?? 0) + 1);
  }

  // Get metrics for star rankings
  const metrics = provider.getMetrics();
  const starsMap = new Map<string, number>();
  for (const m of metrics) {
    starsMap.set(m.protocol, m.github_stars);
  }

  // Build sorted protocol list: primary sort by market deployment count, secondary by github_stars
  const allProtocols = new Set([
    ...Array.from(protocolCounts.keys()),
    ...metrics.map(m => m.protocol),
  ]);

  const suggested_protocols = Array.from(allProtocols)
    .map(p => ({
      protocol: p,
      deployment_count: protocolCounts.get(p) ?? 0,
      github_stars: starsMap.get(p) ?? 0,
    }))
    .sort((a, b) => {
      if (b.deployment_count !== a.deployment_count) return b.deployment_count - a.deployment_count;
      return b.github_stars - a.github_stars;
    });

  const top_protocol = suggested_protocols[0]?.protocol ?? null;
  const top_count = suggested_protocols[0]?.deployment_count ?? 0;

  // Get matching agents
  const agents = provider.getAgents(input.category ? { category: input.category } : undefined);
  const suggested_agents = agents.slice(0, 5).map(a => ({
    name: a.name,
    protocols: a.protocols,
    category: a.category,
    description: a.description,
    role: roleForCategory(a.category),
  }));

  // Build recommendation string
  const marketLabel = input.market ?? "global markets";
  const agent1 = suggested_agents[0];
  const agent2 = suggested_agents[1];

  let recommendation: string;
  if (top_protocol && agent1 && agent2) {
    recommendation = `For a ${input.goal} in ${marketLabel}, ${top_protocol} has the strongest presence with ${top_count} deployment${top_count !== 1 ? "s" : ""}. Consider ${agent1.name} for ${agent1.role} and ${agent2.name} for ${agent2.role}.`;
  } else if (top_protocol && agent1) {
    recommendation = `For a ${input.goal} in ${marketLabel}, ${top_protocol} has the strongest presence with ${top_count} deployment${top_count !== 1 ? "s" : ""}. Consider ${agent1.name} for ${agent1.role}.`;
  } else if (top_protocol) {
    recommendation = `For a ${input.goal} in ${marketLabel}, ${top_protocol} has the strongest market presence with ${top_count} deployment${top_count !== 1 ? "s" : ""}.`;
  } else {
    recommendation = `For a ${input.goal} in ${marketLabel}, no specific protocol data is available yet. Consider evaluating MCP and AdCP as foundational options.`;
  }

  // Build reasoning
  const metricsNote = metrics.length > 0
    ? ` ${metrics.map(m => `${m.protocol} has ${m.github_stars} GitHub stars (${m.maturity})`).join("; ")}.`
    : "";
  const reasoning = `${marketLabel} has ${marketDeployments.length} known deployment${marketDeployments.length !== 1 ? "s" : ""} across ${protocolCounts.size} protocol${protocolCounts.size !== 1 ? "s" : ""}.${metricsNote}${input.budget ? ` Budget consideration: ${input.budget}.` : ""}`;

  return {
    suggested_protocols,
    suggested_agents,
    recommendation,
    reasoning,
    market_coverage: {
      deployments_in_market: marketDeployments.length,
      top_protocol,
    },
    data_as_of: provider.getDataTimestamp(),
  };
}
