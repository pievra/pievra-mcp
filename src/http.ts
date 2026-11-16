// Hosted mode: MCP over SSE behind nginx (pievra.com/mcp/).
//
// What changed (audit C1 and S21):
//  1. One McpServer per connection. The SDK refuses to connect one server object to a
//     second transport, so the shared object broke every connection after the first.
//  2. `server.connect(transport)` already starts the transport. The second, explicit
//     `transport.start()` threw "already started" outside any handler and killed the process.
//  3. Limits per connection and per client address, an idle timeout, a body size cap,
//     a message rate, and request timeouts. Each limit answers with a status code a
//     client can act on (429, 503, 413) instead of holding memory.
//  4. No request handler can take the process down: errors are caught and answered 500.

import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, Server as HttpServer, ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { handleSnapshotRequest } from "./api/snapshot-handler.js";

export type HttpLimits = {
  /** Open SSE sessions, all clients together. Above it: 503. */
  maxSessions: number;
  /** Open SSE sessions for one client address. Above it: 429. */
  maxSessionsPerIp: number;
  /** A session with no client message for this long is closed. */
  idleMs: number;
  /** A session is closed after this long whatever its activity. */
  maxSessionMs: number;
  /** Largest accepted POST body. Above it: 413. */
  maxBodyBytes: number;
  /** Client messages accepted per session and per minute. Above it: 429. */
  messagesPerMinute: number;
  /** How often idle sessions are looked for. */
  sweepMs: number;
};

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : fallback;
}

export function defaultLimits(): HttpLimits {
  return {
    maxSessions: envInt("MCP_MAX_SESSIONS", 200, 1, 10_000),
    maxSessionsPerIp: envInt("MCP_MAX_SESSIONS_PER_IP", 10, 1, 1_000),
    idleMs: envInt("MCP_IDLE_TIMEOUT_MS", 30 * 60_000, 1_000, 24 * 3_600_000),
    maxSessionMs: envInt("MCP_MAX_SESSION_MS", 6 * 3_600_000, 1_000, 24 * 3_600_000),
    maxBodyBytes: envInt("MCP_MAX_BODY_BYTES", 65_536, 1_024, 4_194_304),
    messagesPerMinute: envInt("MCP_MESSAGES_PER_MINUTE", 120, 1, 6_000),
    sweepMs: 30_000,
  };
}

type Session = {
  transport: SSEServerTransport;
  server: McpServer;
  ip: string;
  openedAt: number;
  lastSeen: number;
  windowStart: number;
  windowCount: number;
};

export type HttpApp = {
  httpServer: HttpServer;
  /** Number of open sessions, for tests and for the health route. */
  sessionCount(): number;
  /** Closes idle and expired sessions now. Returns how many were closed. */
  sweep(now?: number): number;
  close(): Promise<void>;
};

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (res.headersSent) { res.end(); return; }
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

/** The server listens on loopback behind nginx, which sets X-Real-IP. Direct loopback callers share one bucket. */
function clientIp(req: IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? "unknown";
  const loopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  const forwarded = req.headers["x-real-ip"];
  if (loopback && typeof forwarded === "string" && /^[0-9a-fA-F.:]{3,45}$/.test(forwarded)) return forwarded;
  return remote;
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string | "too_large"> {
  return new Promise((resolve, reject) => {
    const declared = Number.parseInt(req.headers["content-length"] ?? "", 10);
    if (Number.isFinite(declared) && declared > maxBytes) { req.resume(); resolve("too_large"); return; }
    const chunks: Buffer[] = [];
    let total = 0;
    let over = false;
    req.on("data", (chunk: Buffer) => {
      if (over) return;
      total += chunk.length;
      if (total > maxBytes) { over = true; chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(over ? "too_large" : Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export function createHttpApp(
  makeServer: () => McpServer,
  options: { publicMessagePath?: string; limits?: Partial<HttpLimits> } = {},
): HttpApp {
  const limits: HttpLimits = { ...defaultLimits(), ...options.limits };
  // The address the client is told to POST to. Behind a reverse proxy that mounts this
  // server under a prefix (pievra.com/mcp/), it must carry that prefix, or the client
  // posts to the site root and every tool call fails.
  const publicMessagePath = options.publicMessagePath ?? "/message";
  const sessions = new Map<string, Session>();

  const drop = (id: string) => {
    const s = sessions.get(id);
    if (!s) return;
    sessions.delete(id);
    // Closing the server closes its transport, which ends the SSE response.
    s.server.close().catch(() => undefined);
  };

  const sweep = (now = Date.now()): number => {
    let closed = 0;
    for (const [id, s] of sessions) {
      if (now - s.lastSeen > limits.idleMs || now - s.openedAt > limits.maxSessionMs) { drop(id); closed++; }
    }
    return closed;
  };
  const timer = setInterval(() => sweep(), limits.sweepMs);
  timer.unref();

  const openSession = async (req: IncomingMessage, res: ServerResponse) => {
    const ip = clientIp(req);
    if (sessions.size >= limits.maxSessions) {
      json(res, 503, { error: "server_busy", detail: "Too many open sessions. Retry later." }, { "Retry-After": "30" });
      return;
    }
    let mine = 0;
    for (const s of sessions.values()) if (s.ip === ip) mine++;
    if (mine >= limits.maxSessionsPerIp) {
      json(res, 429, { error: "too_many_sessions", detail: "Too many open sessions for this client." }, { "Retry-After": "30" });
      return;
    }

    const transport = new SSEServerTransport(publicMessagePath, res);
    const server = makeServer();                  // one server object per connection
    const now = Date.now();
    const id = transport.sessionId;
    sessions.set(id, { transport, server, ip, openedAt: now, lastSeen: now, windowStart: now, windowCount: 0 });
    transport.onerror = (e) => console.error(`[pievra-mcp] session ${id}: ${e.message}`);
    res.on("close", () => drop(id));              // client went away
    try {
      await server.connect(transport);            // connect() starts the transport: do not call start() again
    } catch (e) {
      drop(id);
      throw e;
    }
  };

  const postMessage = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const id = url.searchParams.get("sessionId") ?? "";
    const session = sessions.get(id);
    if (!session) { req.resume(); json(res, 404, { error: "Session not found" }); return; }

    const now = Date.now();
    if (now - session.windowStart >= 60_000) { session.windowStart = now; session.windowCount = 0; }
    if (++session.windowCount > limits.messagesPerMinute) {
      req.resume();
      const wait = Math.max(1, Math.ceil((session.windowStart + 60_000 - now) / 1000));
      json(res, 429, { error: "rate_limited", detail: "Too many messages on this session." }, { "Retry-After": String(wait) });
      return;
    }
    if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
      req.resume();
      json(res, 415, { error: "unsupported_media_type", detail: "Send application/json." });
      return;
    }
    const body = await readBody(req, limits.maxBodyBytes);
    if (body === "too_large") {
      json(res, 413, { error: "payload_too_large", detail: `A message is limited to ${limits.maxBodyBytes} bytes.` }, { Connection: "close" });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      json(res, 400, { error: "invalid_json" });
      return;
    }
    session.lastSeen = now;
    await session.transport.handlePostMessage(req, res, parsed);
  };

  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/api/snapshot") { handleSnapshotRequest(req, res); return; }
      if (req.method === "GET" && url.pathname === "/healthz") { json(res, 200, { ok: true, sessions: sessions.size }); return; }
      if (req.method === "GET" && url.pathname === "/") { await openSession(req, res); return; }
      if (req.method === "POST" && url.pathname === "/message") { await postMessage(req, res, url); return; }
      req.resume();
      json(res, 404, { error: "Not found" });
    })().catch((e: unknown) => {
      // Never let one request end the process (that was the whole of C1).
      console.error("[pievra-mcp] request failed:", e instanceof Error ? e.message : e);
      json(res, 500, { error: "internal_error" });
    });
  });
  httpServer.headersTimeout = 15_000;     // slow header attack
  httpServer.requestTimeout = 30_000;     // slow body attack; an SSE GET has no body and is not affected
  httpServer.keepAliveTimeout = 5_000;
  httpServer.maxHeadersCount = 64;

  return {
    httpServer,
    sessionCount: () => sessions.size,
    sweep,
    close: async () => {
      clearInterval(timer);
      for (const id of [...sessions.keys()]) drop(id);
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
        httpServer.closeAllConnections();
      });
    },
  };
}
