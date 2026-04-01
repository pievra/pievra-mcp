#!/usr/bin/env node
import { createServer } from "./server.js";
import { HostedProvider } from "./data/hosted-provider.js";
import { LocalProvider } from "./data/local-provider.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

const args = process.argv.slice(2);
const useSSE = args.includes("--sse");
const portIndex = args.indexOf("--port");
const port = portIndex !== -1 ? parseInt(args[portIndex + 1] ?? "3004", 10) : 3004;

if (useSSE) {
  // SSE mode: use HostedProvider and HTTP server
  const provider = new HostedProvider();
  const mcpServer = createServer(provider);

  // Map of sessionId -> transport for routing POST messages
  const transports = new Map<string, SSEServerTransport>();

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // Stub: /api/snapshot (Task 9 will implement this)
    if (req.method === "GET" && url.pathname === "/api/snapshot") {
      res.writeHead(501, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not implemented yet" }));
      return;
    }

    // SSE: GET / opens a new SSE connection
    if (req.method === "GET" && url.pathname === "/") {
      const transport = new SSEServerTransport("/message", res);
      transports.set(transport.sessionId, transport);

      transport.onclose = () => {
        transports.delete(transport.sessionId);
      };

      await mcpServer.connect(transport);
      await transport.start();
      return;
    }

    // SSE: POST /message delivers a client message
    if (req.method === "POST" && url.pathname === "/message") {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      const transport = transports.get(sessionId);

      if (!transport) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }

      await transport.handlePostMessage(req, res);
      return;
    }

    // 404 for anything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(port, () => {
    console.error(`Pievra MCP server (SSE) listening on port ${port}`);
  });
} else {
  // Stdio mode: use LocalProvider (loads bundled snapshot or fetches from pievra.com)
  const provider = await LocalProvider.load();
  const mcpServer = createServer(provider);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
