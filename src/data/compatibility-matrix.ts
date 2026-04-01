import { CompatibilityResult } from "./types.js";

type PairData = Omit<CompatibilityResult, "protocol_a" | "protocol_b">;

const MATRIX: Record<string, PairData> = {
  "AdCP+MCP": {
    compatible: true,
    relationship: "native",
    bridge_mechanism: "AdCP is built on MCP",
    notes: "AdCP is built on MCP as its transport layer. All AdCP servers are MCP servers.",
  },
  "A2A+AdCP": {
    compatible: true,
    relationship: "native",
    bridge_mechanism: "AdCP uses A2A for agent negotiation",
    notes: "AdCP uses A2A for agent-to-agent negotiation. Multi-party deal flows use A2A.",
  },
  "ARTF+MCP": {
    compatible: true,
    relationship: "compatible",
    bridge_mechanism: "ARTF exposes MCP tool interface",
    notes: "ARTF containers expose MCP tool interfaces. An MCP client can invoke ARTF agents.",
  },
  "A2A+ARTF": {
    compatible: true,
    relationship: "compatible",
    bridge_mechanism: "ARTF supports A2A communication",
    notes: "ARTF supports A2A for inter-container communication.",
  },
  "Agentic Audiences+MCP": {
    compatible: true,
    relationship: "compatible",
    bridge_mechanism: "Embeddings exchanged via MCP tools",
    notes: "Embedding vectors exchanged via MCP tool calls.",
  },
  "AdCP+ARTF": {
    compatible: true,
    relationship: "complementary",
    bridge_mechanism: "Different layers in same campaign",
    notes: "Different layers: AdCP handles campaign workflow, ARTF handles bid-time execution. Both can run in the same campaign.",
  },
  "AdCP+Agentic Audiences": {
    compatible: true,
    relationship: "complementary",
    bridge_mechanism: "Signals Protocol consumes embeddings",
    notes: "AdCP Signals Activation Protocol can consume Agentic Audiences embeddings.",
  },
  "Agentic Audiences+ARTF": {
    compatible: true,
    relationship: "compatible",
    bridge_mechanism: "ARTF processes embedding vectors",
    notes: "ARTF containers can process Agentic Audiences embedding vectors at bid time.",
  },
  "A2A+Agentic Audiences": {
    compatible: false,
    relationship: "no_direct_bridge",
    bridge_mechanism: null,
    notes: "A2A handles agent communication, Agentic Audiences handles signal encoding. Connected via agents that implement both.",
  },
  "A2A+MCP": {
    compatible: true,
    relationship: "complementary",
    bridge_mechanism: "MCP for tools, A2A for agents",
    notes: "MCP connects agents to tools, A2A connects agents to agents. Most production systems use both.",
  },
};

const UNKNOWN_PAIR: PairData = {
  compatible: false,
  relationship: "no_direct_bridge",
  bridge_mechanism: null,
  notes: "Unknown protocol pair. No known interoperability information.",
};

export function getCompatibility(a: string, b: string): CompatibilityResult {
  const key = [a, b].sort().join("+");
  const pair = MATRIX[key] ?? UNKNOWN_PAIR;
  return {
    protocol_a: a,
    protocol_b: b,
    ...pair,
  };
}
