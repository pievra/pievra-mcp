// Outbound HTTP for the tools: one place for the timeout and the response size cap.
// A tool never waits longer than `timeoutMs` (headers and body together) and never
// buffers more than `maxBytes` from the remote side.

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export class ResponseTooLargeError extends Error {
  constructor(public readonly limit: number) {
    super(`response larger than ${limit} bytes`);
    this.name = "ResponseTooLargeError";
  }
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

/** Default budget for one outbound call, headers and body included. */
export const DEFAULT_TIMEOUT_MS = envInt("PIEVRA_FETCH_TIMEOUT_MS", 15_000, 1_000, 60_000);
/** Default cap on a remote body. */
export const DEFAULT_MAX_BYTES = envInt("PIEVRA_FETCH_MAX_BYTES", 1_000_000, 1_024, 16_000_000);

/** Reads a body as text and stops as soon as it exceeds `maxBytes`. */
export async function readCapped(r: Response, maxBytes: number): Promise<string> {
  const declared = Number.parseInt(r.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    await r.body?.cancel().catch(() => undefined);
    throw new ResponseTooLargeError(maxBytes);
  }
  if (!r.body) return "";
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ResponseTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export type CappedResponse = { status: number; ok: boolean; text: string };

/**
 * GET with a hard deadline and a size cap. The deadline also covers the body:
 * the abort signal stays armed until the last byte is read.
 */
export async function fetchCapped(
  url: string,
  opts: { fetcher?: Fetcher; timeoutMs?: number; maxBytes?: number; headers?: Record<string, string> } = {},
): Promise<CappedResponse> {
  const fetcher = opts.fetcher ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const signal = AbortSignal.timeout(timeoutMs);
  const work = (async () => {
    const r = await fetcher(url, { headers: opts.headers, signal });
    const text = await readCapped(r, maxBytes);
    return { status: r.status, ok: r.ok, text };
  })();
  // A fetcher that ignores the signal must not hold the tool open either.
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new Error("timeout"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
    work.catch(() => undefined);
  }
}
