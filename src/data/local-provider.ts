import { createRequire } from "module";
import { fetchCapped } from "../net.js";
import { Agent, Article, DataProvider, Deployment, ProtocolMetrics, SnapshotData } from "./types.js";

const DEFAULT_SNAPSHOT_URL = "https://pievra.com/mcp/api/snapshot";

export class LocalProvider implements DataProvider {
  private data: SnapshotData;

  constructor(data: SnapshotData) {
    this.data = data;
  }

  static async load(snapshotUrl?: string): Promise<LocalProvider> {
    const url = snapshotUrl ?? DEFAULT_SNAPSHOT_URL;

    try {
      // Deadline of 3 s for headers and body together, and a size cap: a slow or oversized
      // answer falls back to the bundled snapshot instead of blocking the start.
      const response = await fetchCapped(url, { timeoutMs: 3000, maxBytes: 8_000_000 });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = JSON.parse(response.text) as SnapshotData;
      if (!data || !Array.isArray(data.agents) || !Array.isArray(data.deployments) || !Array.isArray(data.metrics) || !Array.isArray(data.articles)) {
        throw new Error("unexpected snapshot shape");
      }
      return new LocalProvider(data);
    } catch {
      // Fall back to bundled snapshot
      const require = createRequire(import.meta.url);
      const bundled = require("../data/snapshot.json") as SnapshotData;
      return new LocalProvider(bundled);
    }
  }

  getAgents(opts?: {
    protocol?: string;
    category?: string;
    status?: string;
    query?: string;
  }): Agent[] {
    let results = this.data.agents;

    if (opts?.protocol) {
      const proto = opts.protocol;
      results = results.filter((a) => a.protocols.includes(proto));
    }
    if (opts?.category) {
      const cat = opts.category;
      results = results.filter((a) => a.category === cat);
    }
    if (opts?.status) {
      const st = opts.status;
      results = results.filter((a) => a.status === st);
    }
    if (opts?.query) {
      const q = opts.query.toLowerCase();
      results = results.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return results;
  }

  getDeployments(opts?: {
    protocol?: string;
    country?: string;
    category?: string;
    search?: string;
    limit?: number;
  }): { deployments: Deployment[]; total: number } {
    let results = this.data.deployments;

    if (opts?.protocol) {
      const proto = opts.protocol;
      results = results.filter((d) => d.protocol === proto);
    }
    if (opts?.country) {
      const country = opts.country;
      results = results.filter((d) => d.country === country);
    }
    if (opts?.category) {
      const cat = opts.category;
      results = results.filter((d) => d.category === cat);
    }
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      results = results.filter((d) => d.company.toLowerCase().includes(q));
    }

    const total = results.length;
    const rawLimit = opts?.limit ?? 20;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 20;
    return { deployments: results.slice(0, limit), total };
  }

  getMetrics(protocol?: string): ProtocolMetrics[] {
    let results = this.data.metrics;

    if (protocol) {
      results = results.filter((m) => m.protocol === protocol);
    }

    return results;
  }

  getArticles(opts?: {
    protocol?: string;
    category?: string;
    days?: number;
    limit?: number;
  }): Article[] {
    let results = this.data.articles;

    if (opts?.protocol) {
      const proto = opts.protocol;
      results = results.filter((a) => a.protocols.includes(proto));
    }
    if (opts?.category) {
      const cat = opts.category;
      results = results.filter((a) => a.category === cat);
    }
    if (opts?.days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - opts.days);
      const cutoffStr = cutoff.toISOString().split("T")[0];
      results = results.filter((a) => a.published != null && a.published >= cutoffStr);
    }

    const rawLimit = opts?.limit ?? 10;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 10;
    return results.slice(0, limit);
  }

  getDataTimestamp(): string {
    return this.data.generated_at;
  }
}
