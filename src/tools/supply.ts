// Supply Atlas tools: who is allowed to sell a site or app, and which route to buy through.
// The data comes from the public Pievra Supply Atlas (https://pievra.com/supply), a weekly
// edition built from publishers' ads.txt / app-ads.txt files and the exchanges' sellers.json.
//
// Hardening (audit S21): every call has a deadline and a response size cap (src/net.ts),
// and an error never repeats the upstream address or the low level message, because in
// hosted mode the upstream is an internal address (127.0.0.1:3011).

import { fetchCapped, ResponseTooLargeError, type Fetcher } from "../net.js";

export type { Fetcher } from "../net.js";

const BASE = (process.env.PIEVRA_SUPPLY_API ?? "https://pievra.com/news/api/supply").replace(/\/$/, "");

type Params = Record<string, string | undefined>;
export type SupplyResult = Record<string, unknown>;
export type SupplyOptions = { timeoutMs?: number; maxBytes?: number };

async function get(path: string, params: Params, fetcher: Fetcher, opts: SupplyOptions = {}): Promise<SupplyResult> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, v);
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ""}`;
  try {
    const r = await fetchCapped(url, { fetcher, headers: { accept: "application/json" }, ...opts });
    if (r.status === 404) return { error: "not_found", detail: "The Supply Atlas has no such market or record." };
    if (r.status === 422) return { error: "invalid_input", detail: "Check the domain or ad system spelling." };
    if (!r.ok) return { error: "unavailable", detail: `The Supply Atlas returned HTTP ${r.status}.` };
    let body: unknown;
    try {
      body = JSON.parse(r.text);
    } catch {
      return { error: "unavailable", detail: "The Supply Atlas returned an answer that is not JSON." };
    }
    const record = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as SupplyResult) : { items: body };
    return { ...record, source: "https://pievra.com/supply" };
  } catch (e) {
    if (e instanceof ResponseTooLargeError) {
      return { error: "response_too_large", detail: `The Supply Atlas answer exceeds ${e.limit} bytes. Narrow the request.` };
    }
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    // Generic on purpose: the low level message can name the internal address.
    return { error: "unavailable", detail: timedOut ? "The Supply Atlas did not answer in time." : "The Supply Atlas could not be reached." };
  }
}

const clean = (s: string) => s.trim().toLowerCase();

export function supplyMarkets(fetcher: Fetcher = fetch, opts?: SupplyOptions): Promise<SupplyResult> {
  return get("/v1/markets", {}, fetcher, opts);
}

export function supplyLookupSite(input: { domain: string }, fetcher: Fetcher = fetch, opts?: SupplyOptions): Promise<SupplyResult> {
  return get("/v1/lookup", { domain: clean(input.domain) }, fetcher, opts);
}

export function supplyCheckSeller(
  input: { domain: string; ad_system: string; seller_id?: string }, fetcher: Fetcher = fetch, opts?: SupplyOptions,
): Promise<SupplyResult> {
  return get("/v1/authorised", { domain: clean(input.domain), ad_system: clean(input.ad_system), seller_id: input.seller_id?.trim() }, fetcher, opts);
}

export function supplyBuyingRoutes(input: { market: string; kind?: string }, fetcher: Fetcher = fetch, opts?: SupplyOptions): Promise<SupplyResult> {
  const kind = input.kind === "app_ios" || input.kind === "app" ? "app_ios" : input.kind === "site" ? "site" : undefined;
  return get("/v1/routes", { market: clean(input.market), kind }, fetcher, opts);
}
