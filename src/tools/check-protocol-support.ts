import type { DataProvider } from "../data/types.js";

type Input = { company: string };
type Output = {
  company: string;
  protocols: Array<{ protocol: string; use_case: string | null; announced_date: string | null }>;
  total_protocols: number;
  data_as_of: string;
};

export function checkProtocolSupport(provider: DataProvider, input: Input): Output {
  const { deployments } = provider.getDeployments({ search: input.company });

  // Group by protocol, keeping first use_case and announced_date seen
  const protocolMap = new Map<string, { use_case: string | null; announced_date: string | null }>();
  for (const d of deployments) {
    if (!protocolMap.has(d.protocol)) {
      protocolMap.set(d.protocol, { use_case: d.use_case, announced_date: d.announced_date });
    }
  }

  const protocols = Array.from(protocolMap.entries()).map(([protocol, data]) => ({
    protocol,
    use_case: data.use_case,
    announced_date: data.announced_date,
  }));

  return {
    company: input.company,
    protocols,
    total_protocols: protocols.length,
    data_as_of: provider.getDataTimestamp(),
  };
}
