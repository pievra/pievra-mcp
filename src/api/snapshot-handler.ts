import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { IncomingMessage, ServerResponse } from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedSnapshot: string | null = null;
let cachedAt = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export function handleSnapshotRequest(req: IncomingMessage, res: ServerResponse) {
  // Only handle GET
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const now = Date.now();

  // Reload from disk if cache is stale
  if (!cachedSnapshot || now - cachedAt > CACHE_TTL) {
    try {
      const snapshotPath = join(__dirname, "..", "data", "snapshot.json");
      cachedSnapshot = readFileSync(snapshotPath, "utf-8");
      cachedAt = now;
    } catch {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Snapshot not yet generated" }));
      return;
    }
  }

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=21600", // 6h
    "Access-Control-Allow-Origin": "*",
  });
  res.end(cachedSnapshot);
}
