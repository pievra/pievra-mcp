import type { DataProvider, Deployment } from "../data/types.js";

type Input = {
  protocol?: string;
  country?: string;
  category?: string;
  search?: string;
  limit?: number;
};
type Output = {
  deployments: Deployment[];
  total: number;
  data_as_of: string;
};

export function findDeployments(provider: DataProvider, input: Input): Output {
  const { deployments, total } = provider.getDeployments({
    protocol: input.protocol,
    country: input.country,
    category: input.category,
    search: input.search,
    limit: input.limit,
  });
  return {
    deployments,
    total,
    data_as_of: provider.getDataTimestamp(),
  };
}
