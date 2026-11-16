#!/usr/bin/env node
import { createServer } from "./server.js";
import { HostedProvider } from "./data/hosted-provider.js";
import { LocalProvider } from "./data/local-provider.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpApp } from "./http.js";

const args = process.argv.slice(2);
const useSSE = args.includes("--sse");
const portIndex = args.indexOf("--port");
const publicMessagePath = process.env.MCP_PUBLIC_MESSAGE_PATH ?? "/message";
const port = portIndex !== -1 ? parseInt(args[portIndex + 1] ?? "3004", 10) : 3004;

if (useSSE) {
  // Hosted mode: one read-only data provider for the process, one MCP server object per
  // connection (see src/http.ts for the reason and for the limits).
  const provider = new HostedProvider();
  const app = createHttpApp(() => createServer(provider), { publicMessagePath });

  // A fault in one session is logged; it must not stop the service for the others.
  process.on("unhandledRejection", (reason) => {
    console.error("[pievra-mcp] unhandled rejection:", reason instanceof Error ? reason.message : reason);
  });

  app.httpServer.listen(port, "127.0.0.1", () => {
    console.error(`Pievra MCP server (SSE) listening on 127.0.0.1:${port}`);
  });

  const stop = () => { void app.close().then(() => process.exit(0)); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
} else {
  // Stdio mode: use LocalProvider (loads bundled snapshot or fetches from pievra.com)
  const provider = await LocalProvider.load();
  const mcpServer = createServer(provider);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
