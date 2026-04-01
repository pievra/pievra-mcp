// === Entity Types ===

export type Agent = {
  name: string;
  icon: string;
  category: string;
  version: string;
  status: string;
  featured: boolean;
  protocols: string[];
  steward: string;
  description: string;
  tags: string[];
  link: string;
};

export type Deployment = {
  company: string;
  protocol: string;
  country: string | null;
  region: string | null;
  category: string | null;
  use_case: string | null;
  announced_date: string | null;
};

export type ProtocolMetrics = {
  protocol: string;
  github_stars: number;
  npm_weekly_downloads: number;
  pypi_weekly_downloads: number;
  github_contributors: number;
  github_commits_30d: number;
  maturity: string;
  momentum_30d_pct: number | null;
  date: string;
};

export type Article = {
  title: string;
  source: string;
  url: string;
  category: string | null;
  protocols: string[];
  published: string | null;
};

export type CompatibilityResult = {
  protocol_a: string;
  protocol_b: string;
  compatible: boolean;
  relationship: "native" | "compatible" | "complementary" | "no_direct_bridge";
  bridge_mechanism: string | null;
  notes: string;
};

// === Snapshot shape (for local provider / API) ===

export type SnapshotData = {
  agents: Agent[];
  metrics: ProtocolMetrics[];
  deployments: Deployment[];
  articles: Article[];
  generated_at: string;
};

// === Data Provider Interface ===

export interface DataProvider {
  getAgents(opts?: {
    protocol?: string;
    category?: string;
    status?: string;
    query?: string;
  }): Agent[];

  getDeployments(opts?: {
    protocol?: string;
    country?: string;
    category?: string;
    search?: string;
    limit?: number;
  }): { deployments: Deployment[]; total: number };

  getMetrics(protocol?: string): ProtocolMetrics[];

  getArticles(opts?: {
    protocol?: string;
    category?: string;
    days?: number;
    limit?: number;
  }): Article[];

  getDataTimestamp(): string;
}
