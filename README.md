# Pievra MCP Server

Cross-protocol intelligence for agentic advertising. An MCP server exposing 11 tools that AI agents use to discover, evaluate, and assemble advertising technology stacks across AdCP, MCP, A2A, ARTF, and Agentic Audiences.

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
| `supply_list_markets` | Markets in the Pievra Supply Atlas, with tracked and graded sites and apps |
| `supply_lookup_site` | A site's supply path grade and the ad systems with a confirmed direct route to it |
| `supply_check_seller` | Whether an ad system or seller account is authorised in a domain's ads.txt, and whether sellers.json confirms it |
| `supply_buying_routes` | The shortest list of ad systems that reaches a market's graded sites or apps directly |

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
npm run build                    # tsc, then copies src/data/snapshot.json into dist/data
node dist/index.js --stdio       # test locally
node dist/index.js --sse --port 3004  # run SSE server
npx vitest run                   # tests (54 passing, tests/sse.test.ts runs the hosted server over real sockets)
npm run audit                    # fails on a high or critical advisory (0 known on 16 November 2026)
```

## Data Sources

| Protocol | GitHub | npm | Status |
|----------|--------|-----|--------|
| MCP | modelcontextprotocol/modelcontextprotocol | @modelcontextprotocol/sdk | Stable |
| AdCP | adcontextprotocol/adcp | @adcp/client | Beta |
| A2A | a2aproject/A2A | - | Stable |
| ARTF | IABTechLab/agentic-rtb-framework | - | Final |
| Agentic Audiences | IABTechLab/agentic-audiences | - | Draft |

## License

**Source-available.** Copyright (c) 2026 Pievra. You may connect to and use the
Pievra MCP service. You may not fork, rebrand, or operate a competing service
from this code. Full terms in [LICENSE](LICENSE) (Business Source License 1.1;
converts to Apache-2.0 on 2030-06-29).

## Hosted mode: limits and guarantees

The hosted server (`--sse`) creates one MCP server object per connection and survives client disconnects. Before 16 November 2026 it exited on the first connection (`connect()` followed by a second `start()`); `tests/sse.test.ts` is the regression test.

| Limit | Default | Environment variable | Answer when exceeded |
|---|---|---|---|
| Open sessions, whole server | 200 | `MCP_MAX_SESSIONS` | 503 with `Retry-After` |
| Open sessions per client address (`X-Real-IP` set by nginx) | 10 | `MCP_MAX_SESSIONS_PER_IP` | 429 |
| Idle time before a session is closed | 30 min | `MCP_IDLE_TIMEOUT_MS` | connection closed |
| Longest session | 6 h | `MCP_MAX_SESSION_MS` | connection closed |
| POST body | 64 KiB | `MCP_MAX_BODY_BYTES` | 413 |
| Messages per session per minute | 120 | `MCP_MESSAGES_PER_MINUTE` | 429 with `Retry-After` |
| Outbound call of a supply tool (headers and body) | 15 s | `PIEVRA_FETCH_TIMEOUT_MS` | `{"error":"unavailable"}` |
| Outbound response size | 1 MB | `PIEVRA_FETCH_MAX_BYTES` | `{"error":"response_too_large"}` |
| Text of one tool answer | 256 KiB | `PIEVRA_MAX_RESULT_BYTES` | `{"error":"response_too_large"}` |

Every tool input is validated by a zod schema (`src/server.ts`): bounded strings, integers in range for `limit` and `days`, host name pattern for domains, closed list for `kind`. An invalid call is refused before the tool runs.

Every tool answer is a JSON envelope: `{"kind":"pievra.tool_result","content_is":"data","notice":…,"origin":…,"data":{…}}`. The payload that existed before sits unchanged under `data`. Third party text (agent descriptions, headlines, Supply Atlas fields) is data to report, never instructions; control and zero width characters are removed. Clients that parsed the previous top level fields must now read `data`.

`GET /healthz` answers `{"ok":true,"sessions":N}` for PM2 or nginx health checks. Not yet done: the SSE transport is deprecated by the SDK in favour of Streamable HTTP; the migration changes the public endpoint and needs a client announcement.
