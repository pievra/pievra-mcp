import { describe, it, expect } from "vitest";
import { supplyBuyingRoutes, supplyCheckSeller, supplyLookupSite, supplyMarkets, type Fetcher } from "../src/tools/supply.js";

function mock(status: number, body: unknown) {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url) => { calls.push(url); return new Response(JSON.stringify(body), { status }); };
  return { calls, fetcher };
}

describe("supply atlas tools", () => {
  it("looks up a site by normalised domain and names its source", async () => {
    const m = mock(200, { domain: "lemonde.fr", in_atlas: true });
    const r = await supplyLookupSite({ domain: "  LeMonde.fr " }, m.fetcher);
    expect(m.calls[0]).toMatch(/\/v1\/lookup\?domain=lemonde\.fr$/);
    expect(r).toMatchObject({ in_atlas: true, source: "https://pievra.com/supply" });
  });

  it("passes the seller id only when given", async () => {
    const m = mock(200, { authorised: true });
    await supplyCheckSeller({ domain: "a.com", ad_system: "Google.com" }, m.fetcher);
    await supplyCheckSeller({ domain: "a.com", ad_system: "google.com", seller_id: "pub-1" }, m.fetcher);
    expect(m.calls[0]).toMatch(/authorised\?domain=a\.com&ad_system=google\.com$/);
    expect(m.calls[1]).toContain("seller_id=pub-1");
  });

  it("maps app to app_ios and drops unknown kinds", async () => {
    const m = mock(200, { shortlist: [] });
    await supplyBuyingRoutes({ market: "FR", kind: "app" }, m.fetcher);
    await supplyBuyingRoutes({ market: "fr", kind: "tv" }, m.fetcher);
    expect(m.calls[0]).toMatch(/routes\?market=fr&kind=app_ios$/);
    expect(m.calls[1]).toMatch(/routes\?market=fr$/);
  });

  it("returns a structured error instead of throwing", async () => {
    expect(await supplyBuyingRoutes({ market: "zz" }, mock(404, {}).fetcher)).toMatchObject({ error: "not_found" });
    expect(await supplyMarkets(mock(503, {}).fetcher)).toMatchObject({ error: "unavailable" });
    const failing: Fetcher = async () => { throw new Error("boom"); };
    expect(await supplyLookupSite({ domain: "a.com" }, failing)).toMatchObject({ error: "unavailable" });
  });
});
