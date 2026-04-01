import { HostedProvider } from "../src/data/hosted-provider.js";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { SnapshotData } from "../src/data/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const provider = new HostedProvider();

const snapshot: SnapshotData = {
  agents: provider.getAgents(),
  metrics: provider.getMetrics(),
  deployments: provider.getDeployments({ limit: 500 }).deployments,
  articles: provider.getArticles({ days: 30, limit: 50 }),
  generated_at: new Date().toISOString(),
};

const outPath = join(__dirname, "..", "src", "data", "snapshot.json");
writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

console.log(`Snapshot generated: ${snapshot.agents.length} agents, ${snapshot.metrics.length} metrics, ${snapshot.deployments.length} deployments, ${snapshot.articles.length} articles`);
console.log(`Written to: ${outPath}`);
