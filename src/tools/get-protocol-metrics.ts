import type { DataProvider } from "../data/types.js";

type Input = { protocol?: string };
type Output = {
  metrics: Array<{
    protocol: string;
    github_stars: number;
    npm_weekly_downloads: number;
    pypi_weekly_downloads: number;
    contributors: number;
    maturity: string;
    momentum_30d_pct: number | null;
  }>;
  data_as_of: string;
};

export function getProtocolMetrics(provider: DataProvider, input: Input): Output {
  const raw = provider.getMetrics(input.protocol);
  return {
    metrics: raw.map(m => ({
      protocol: m.protocol,
      github_stars: m.github_stars,
      npm_weekly_downloads: m.npm_weekly_downloads,
      pypi_weekly_downloads: m.pypi_weekly_downloads,
      contributors: m.github_contributors,
      maturity: m.maturity,
      momentum_30d_pct: m.momentum_30d_pct,
    })),
    data_as_of: provider.getDataTimestamp(),
  };
}
