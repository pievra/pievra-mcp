import type { DataProvider, Agent } from "../data/types.js";

type Input = { protocol?: string; category?: string; status?: string; query?: string };
type Output = {
  agents: Array<Omit<Agent, "icon" | "featured" | "tags">>;
  count: number;
  data_as_of: string;
};

export function discoverAgents(provider: DataProvider, input: Input): Output {
  const agents = provider.getAgents(input);
  return {
    agents: agents.map(a => ({
      name: a.name,
      protocols: a.protocols,
      category: a.category,
      version: a.version,
      status: a.status,
      steward: a.steward,
      description: a.description,
      link: a.link,
    })),
    count: agents.length,
    data_as_of: provider.getDataTimestamp(),
  };
}
