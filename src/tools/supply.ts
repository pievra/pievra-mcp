// Supply Atlas tools: who is allowed to sell a site or app, and which route to buy through.
// The data comes from the public Pievra Supply Atlas (https://pievra.com/supply), a weekly
// edition built from publishers' ads.txt / app-ads.txt files and the exchanges' sellers.json.

const BASE = (process.env.PIEVRA_SUPPLY_API ?? "https://pievra.com/news/api/supply").replace(/\/$/, "");

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Params = Record<string, string | undefined>;
export type SupplyResult = Record<string, unknown>;

async function get(path: string, params: Params, fetcher: Fetcher): Promise<SupplyResult> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, v);
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ""}`;
  try {
    const r = await fetcher(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (r.status === 404) return { error: "not_found", detail: "The Supply Atlas has no such market or record." };
    if (r.status === 422) return { error: "invalid_input", detail: "Check the domain or ad system spelling." };
    if (!r.ok) return { error: "unavailable", detail: `The Supply Atlas returned HTTP ${r.status}.` };
    return { ...(await r.json() as SupplyResult), source: "https://pievra.com/supply" };
  } catch (e) {
    return { error: "unavailable", detail: `The Supply Atlas could not be reached: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const clean = (s: string) => s.trim().toLowerCase();

export function supplyMarkets(fetcher: Fetcher = fetch): Promise<SupplyResult> {
  return get("/v1/markets", {}, fetcher);
}

export function supplyLookupSite(input: { domain: string }, fetcher: Fetcher = fetch): Promise<SupplyResult> {
  return get("/v1/lookup", { domain: clean(input.domain) }, fetcher);
}

export function supplyCheckSeller(
  input: { domain: string; ad_system: string; seller_id?: string }, fetcher: Fetcher = fetch,
): Promise<SupplyResult> {
  return get("/v1/authorised", { domain: clean(input.domain), ad_system: clean(input.ad_system), seller_id: input.seller_id?.trim() }, fetcher);
}

export function supplyBuyingRoutes(input: { market: string; kind?: string }, fetcher: Fetcher = fetch): Promise<SupplyResult> {
  const kind = input.kind === "app_ios" || input.kind === "app" ? "app_ios" : input.kind === "site" ? "site" : undefined;
  return get("/v1/routes", { market: clean(input.market), kind }, fetcher);
}
