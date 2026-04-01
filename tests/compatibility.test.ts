import { describe, it, expect } from "vitest";
import { getCompatibility } from "../src/data/compatibility-matrix.js";

describe("getCompatibility", () => {
  it("returns native for AdCP + MCP", () => {
    const result = getCompatibility("AdCP", "MCP");
    expect(result.compatible).toBe(true);
    expect(result.relationship).toBe("native");
  });

  it("is order-independent", () => {
    const ab = getCompatibility("AdCP", "MCP");
    const ba = getCompatibility("MCP", "AdCP");
    expect(ab.relationship).toBe(ba.relationship);
    expect(ab.notes).toBe(ba.notes);
  });

  it("returns no_direct_bridge for A2A + Agentic Audiences", () => {
    const result = getCompatibility("A2A", "Agentic Audiences");
    expect(result.compatible).toBe(false);
    expect(result.relationship).toBe("no_direct_bridge");
  });

  it("returns complementary for MCP + A2A", () => {
    const result = getCompatibility("MCP", "A2A");
    expect(result.relationship).toBe("complementary");
  });

  it("handles unknown protocols", () => {
    const result = getCompatibility("FooBar", "MCP");
    expect(result.compatible).toBe(false);
    expect(result.relationship).toBe("no_direct_bridge");
  });

  it("sets protocol_a and protocol_b in output", () => {
    const result = getCompatibility("ARTF", "A2A");
    expect(result.protocol_a).toBe("ARTF");
    expect(result.protocol_b).toBe("A2A");
  });
});
