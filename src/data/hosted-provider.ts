import Database from "better-sqlite3";
import os from "os";
import path from "path";
import { Agent, Article, DataProvider, Deployment, ProtocolMetrics } from "./types.js";

const MATURITY_MAP: Record<string, string> = {
  MCP: "Stable",
  AdCP: "Beta",
  A2A: "Stable",
  ARTF: "Final",
  "Agentic Audiences": "Draft",
};

export class HostedProvider implements DataProvider {
  private analyticsDb: Database.Database;
  private newsDb: Database.Database;

  constructor(analyticsDbPath?: string, newsDbPath?: string) {
    const home = os.homedir();
    const aPath = analyticsDbPath ?? path.join(home, ".pievra-analytics", "analytics.db");
    const nPath = newsDbPath ?? path.join(home, ".pievra-news", "news.db");

    this.analyticsDb = new Database(aPath, { readonly: true });
    this.newsDb = new Database(nPath, { readonly: true });
  }

  getAgents(opts?: {
    protocol?: string;
    category?: string;
    status?: string;
    query?: string;
  }): Agent[] {
    // agents table may not exist yet (created by Task 5)
    try {
      const tableCheck = this.analyticsDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'")
        .get();
      if (!tableCheck) return [];

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (opts?.protocol) {
        conditions.push(`protocols LIKE ?`);
        params.push(`%"${opts.protocol}"%`);
      }
      if (opts?.category) {
        conditions.push(`category = ?`);
        params.push(opts.category);
      }
      if (opts?.status) {
        conditions.push(`status = ?`);
        params.push(opts.status);
      }
      if (opts?.query) {
        const like = `%${opts.query}%`;
        conditions.push(`(name LIKE ? OR description LIKE ? OR tags LIKE ?)`);
        params.push(like, like, like);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const sql = `SELECT * FROM agents ${where}`;
      const rows = this.analyticsDb.prepare(sql).all(...params) as Record<string, unknown>[];

      return rows.map((row) => ({
        name: row.name as string,
        icon: (row.icon as string) ?? "",
        category: (row.category as string) ?? "",
        version: (row.version as string) ?? "",
        status: (row.status as string) ?? "",
        featured: Boolean(row.featured),
        protocols: typeof row.protocols === "string" ? (JSON.parse(row.protocols) as string[]) : [],
        steward: (row.steward as string) ?? "",
        description: (row.description as string) ?? "",
        tags: typeof row.tags === "string" ? (JSON.parse(row.tags) as string[]) : [],
        link: (row.link as string) ?? "",
      }));
    } catch {
      return [];
    }
  }

  getDeployments(opts?: {
    protocol?: string;
    country?: string;
    category?: string;
    search?: string;
    limit?: number;
  }): { deployments: Deployment[]; total: number } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts?.protocol) {
      conditions.push(`protocol = ?`);
      params.push(opts.protocol);
    }
    if (opts?.country) {
      conditions.push(`country = ?`);
      params.push(opts.country);
    }
    if (opts?.category) {
      conditions.push(`category = ?`);
      params.push(opts.category);
    }
    if (opts?.search) {
      conditions.push(`company LIKE ?`);
      params.push(`%${opts.search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countSql = `SELECT COUNT(*) as cnt FROM deployments ${where}`;
    const countRow = this.analyticsDb.prepare(countSql).get(...params) as { cnt: number };
    const total = countRow.cnt;

    const rawLimit = opts?.limit ?? 20;
    const limit = Math.min(rawLimit, 100);
    const dataSql = `SELECT * FROM deployments ${where} LIMIT ?`;
    const rows = this.analyticsDb.prepare(dataSql).all(...params, limit) as Record<string, unknown>[];

    const deployments: Deployment[] = rows.map((row) => ({
      company: row.company as string,
      protocol: row.protocol as string,
      country: (row.country as string | null) ?? null,
      region: (row.region as string | null) ?? null,
      category: (row.category as string | null) ?? null,
      use_case: (row.use_case as string | null) ?? null,
      announced_date: (row.announced_date as string | null) ?? null,
    }));

    return { deployments, total };
  }

  getMetrics(protocol?: string): ProtocolMetrics[] {
    // Get the latest date available
    const latestRow = this.analyticsDb
      .prepare("SELECT MAX(date) as latest_date FROM protocol_metrics")
      .get() as { latest_date: string | null };
    const latestDate = latestRow.latest_date;
    if (!latestDate) return [];

    // Get the date ~30 days ago for momentum calculation
    const oldRows = this.analyticsDb
      .prepare(
        `SELECT * FROM protocol_metrics WHERE date = (
          SELECT MAX(date) FROM protocol_metrics WHERE date <= date(?, '-30 days')
        )`,
      )
      .all(latestDate) as Record<string, unknown>[];

    const oldByProtocol = new Map<string, number>();
    for (const row of oldRows) {
      oldByProtocol.set(
        row.protocol as string,
        (row.npm_weekly_downloads as number) +
          (row.pypi_weekly_downloads as number) +
          (row.github_stars as number),
      );
    }

    const conditions: string[] = [`date = ?`];
    const params: unknown[] = [latestDate];

    if (protocol) {
      conditions.push(`protocol = ?`);
      params.push(protocol);
    }

    const sql = `SELECT * FROM protocol_metrics WHERE ${conditions.join(" AND ")}`;
    const rows = this.analyticsDb.prepare(sql).all(...params) as Record<string, unknown>[];

    return rows.map((row) => {
      const proto = row.protocol as string;
      const latestScore =
        (row.npm_weekly_downloads as number) +
        (row.pypi_weekly_downloads as number) +
        (row.github_stars as number);
      const oldScore = oldByProtocol.get(proto);
      let momentum_30d_pct: number | null = null;
      if (oldScore != null && oldScore !== 0) {
        momentum_30d_pct = ((latestScore - oldScore) / oldScore) * 100;
      }

      return {
        protocol: proto,
        github_stars: row.github_stars as number,
        npm_weekly_downloads: row.npm_weekly_downloads as number,
        pypi_weekly_downloads: row.pypi_weekly_downloads as number,
        github_contributors: row.github_contributors as number,
        github_commits_30d: row.github_commits_30d as number,
        maturity: MATURITY_MAP[proto] ?? "Unknown",
        momentum_30d_pct,
        date: row.date as string,
      };
    });
  }

  getArticles(opts?: {
    protocol?: string;
    category?: string;
    days?: number;
    limit?: number;
  }): Article[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts?.protocol) {
      conditions.push(`protocols LIKE ?`);
      params.push(`%${opts.protocol}%`);
    }
    if (opts?.category) {
      conditions.push(`category = ?`);
      params.push(opts.category);
    }
    if (opts?.days) {
      conditions.push(`published >= date('now', '-${Number(opts.days)} days')`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rawLimit = opts?.limit ?? 10;
    const limit = Math.min(rawLimit, 50);
    const sql = `SELECT * FROM articles ${where} ORDER BY published DESC LIMIT ?`;
    const rows = this.newsDb.prepare(sql).all(...params, limit) as Record<string, unknown>[];

    return rows.map((row) => ({
      title: row.title as string,
      source: row.source as string,
      url: row.url as string,
      category: (row.category as string | null) ?? null,
      protocols:
        typeof row.protocols === "string"
          ? (JSON.parse(row.protocols) as string[])
          : [],
      published: (row.published as string | null) ?? null,
    }));
  }

  getDataTimestamp(): string {
    const row = this.analyticsDb
      .prepare("SELECT MAX(date) as latest FROM protocol_metrics")
      .get() as { latest: string | null };
    return row.latest ?? new Date().toISOString();
  }
}
