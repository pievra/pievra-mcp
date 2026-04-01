# Pievra MCP Server

Cross-protocol intelligence for agentic advertising. An MCP server exposing 7 tools that AI agents use to discover, evaluate, and assemble advertising technology stacks across AdCP, MCP, A2A, ARTF, and Agentic Audiences.

**Live at [pievra.com/mcp](https://pievra.com/news/mcp)**

## Connect

### Remote (SSE)

```json
{
  "mcpServers": {
    "pievra": {
      "url": "https://pievra.com/mcp/"
    }
  }
}
```

### Local (stdio)

```bash
npx @pievra/mcp-server
```

## Tools

| Tool | Description |
|------|-------------|
| `discover_agents` | Find AI agents by protocol, category, or status (26 agents indexed) |
| `check_protocol_support` | Look up which protocols a company supports |
| `get_protocol_metrics` | GitHub stars, npm downloads, contributors, momentum for all 5 protocols |
| `find_deployments` | Search 73+ deployments by country, protocol, category |
| `get_compatibility` | Check interoperability between any two protocols |
| `recommend_stack` | Get recommended agents and protocols for a campaign goal |
| `get_market_news` | Latest agentic advertising news from 8 publications |

## Example

Ask any MCP-connected AI agent:

> "Which protocols should I use for a programmatic CTV campaign in France?"

The agent calls `recommend_stack` and `find_deployments` to give you a data-backed answer.

## Architecture

```
Two deployment modes, same tools:

Hosted (SSE):  Agent --> pievra.com/mcp --> SQLite (live data)
Local (stdio): Agent --> npx @pievra/mcp-server --> JSON snapshot
```

- Every response includes `data_as_of` timestamp for freshness transparency
- Metrics collected daily from GitHub, npm, PyPI
- Deployment directory curated from registries, news, and manual entries
- Snapshot API at `GET /mcp/api/snapshot` for local clients

## Tech Stack

- TypeScript
- @modelcontextprotocol/sdk (MCP protocol)
- better-sqlite3 (hosted mode)
- PM2 (deployment)

## Development

```bash
npm install
npx tsc                          # build
node dist/index.js --stdio       # test locally
node dist/index.js --sse --port 3004  # run SSE server
npx vitest run                   # tests (43 passing)
```

## Data Sources

| Protocol | GitHub | npm | Status |
|----------|--------|-----|--------|
| MCP | modelcontextprotocol/modelcontextprotocol | @modelcontextprotocol/sdk | Stable |
| AdCP | adcontextprotocol/adcp | @adcp/client | Beta |
| A2A | a2aproject/A2A | - | Stable |
| ARTF | IABTechLab/agentic-rtb-framework | - | Final |
| Agentic Audiences | IABTechLab/agentic-audiences | - | Draft |
