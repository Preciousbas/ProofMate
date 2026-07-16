# ProofMate API

Base URL: your production origin (e.g. `https://your-app.vercel.app`)

Skill map for agents: `GET /api/agent` · skill manifesto: `GET /api/skill` (repo file: [`SKILL.md`](../SKILL.md))

## Authentication

When `PROOFMATE_API_KEY` is set on the server (required for production ASP), skill routes require:

```http
x-api-key: <PROOFMATE_API_KEY>
```

or

```http
Authorization: Bearer <PROOFMATE_API_KEY>
```

Protected: `/api/analyze`, `/api/search`, `/api/resolve`, `/api/follow-up`  
Public: `/api/agent`, `/api/skill`  

If the env var is unset (local dev), skill routes stay open. The website demo uses server actions and does not need a browser-exposed key.
---

## `GET /api/search` (`search_token`)

Find tokens by ticker or name.

| Param | Required | Description |
|-------|----------|-------------|
| `q` | yes | Ticker or name (`PEPE`, `CASHCAT`, …) |
| `chain` | no | ProofMate chain id, or `all` |

**Response `200`**

```json
{
  "results": [
    {
      "chainId": "eth",
      "chainLabel": "Ethereum",
      "address": "0x…",
      "symbol": "PEPE",
      "name": "Pepe",
      "liquidityUsd": 1234567
    }
  ]
}
```

---

## `GET /api/resolve` (`resolve_ticker`)

Pick **one** best match for a ticker (canonical majors like ETH→WETH, else top search hit).

| Param | Required | Description |
|-------|----------|-------------|
| `q` | yes | Ticker / symbol |
| `chain` | no | Optional chain filter |

**Response `200`**

```json
{
  "hit": { "chainId": "eth", "address": "0x…", "symbol": "WETH", "name": "Wrapped Ether" },
  "via": "canonical",
  "candidates": 1,
  "note": "…",
  "next": {
    "skill": "analyze_token",
    "method": "GET",
    "path": "/api/analyze?tokenAddress=0x…&chain=eth"
  }
}
```

**Errors:** `404` unresolved · `429` rate limit · `502` upstream

---

## `GET /api/analyze` (`analyze_token`)

Analyze a token contract / mint.

**Query**

| Param | Required | Description |
|-------|----------|-------------|
| `tokenAddress` | yes | EVM `0x` + 40 hex, or Solana mint |
| `chain` | no | `eth`, `bsc`, `sol`, `robinhood`, … — omit to auto-detect |

**Response `200`**

```json
{
  "sessionId": "uuid",
  "memo": { "riskScore": 30, "riskLevel": "moderate", "redFlags": [], "…": "…" },
  "evidence": { "contract": {}, "holders": {}, "market": {}, "sources": [] }
}
```

CDN note: identical addresses share cached work briefly.

**Errors:** `400` invalid address · `429` rate limit · `502` upstream failure

---

## `POST /api/analyze`

Same as GET; body:

```json
{ "tokenAddress": "0x…", "chain": "eth" }
```

Prefer GET when calling from agents or browsers that can cache.

---

## `POST /api/follow-up` (`token_follow_up`)

Ask a follow-up against a prior analysis.

```json
{
  "question": "Show me the top holder risk",
  "evidence": { },
  "memo": { }
}
```

**Response `200`**

```json
{ "answer": "…", "grounded": true, "source": "rules" }
```

`source` is `rules`, `llm`, or `fallback`.

Send the **unchanged** `evidence` + `memo` from analyze. There is no server-side session store.

The server validates both objects and **re-scores** evidence. If `riskScore`, `riskLevel`, or red-flag titles do not match, the request is rejected (`400`). After a scoring redeploy, analyze the token again before follow-ups. Do not fabricate or edit those fields.

Answer pipeline: rules for common questions → optional Groq for open questions (when enabled; invented numbers are rejected) → memo fallback. Set `PROOFMATE_FOLLOW_UP_LLM=0` to skip Groq.

---

## `GET /api/agent`

ASP metadata for agents (skills, chains, routes, framing, MCP entry).

## MCP (stdio)

See [mcp.md](./mcp.md). Run: `PROOFMATE_BASE_URL=<origin> PROOFMATE_API_KEY=<key> npm run mcp`

---

## Environment (server)

| Variable | Required |
|----------|----------|
| `ETHERSCAN_API_KEY` | yes (EVM explorers) |
| `MORALIS_API_KEY` | yes (holders / Solana meta) |
| `SOLSCAN_API_KEY` | no (Solscan Pro only) |
| `ROBINHOOD_API_KEY` | no (Blockscout Pro for Robinhood) |
| `GROQ_API_KEY` | no (memo polish + open follow-ups) |
| `PROOFMATE_SKIP_MEMO_POLISH` | no (set `1` to skip memo polish) |
| `PROOFMATE_FOLLOW_UP_LLM` | no (set `0` to disable open Groq follow-ups) |
| `PROOFMATE_API_KEY` | **yes in production** (skill route auth) |
| `UPSTASH_REDIS_REST_URL` | recommended in production (shared rate limits) |
| `UPSTASH_REDIS_REST_TOKEN` | recommended in production |
| `PROOFMATE_BASE_URL` | no (MCP clients — public site origin) |

## Rate limits

Per IP (and a separate global budget) per rolling minute:

| Scope | Per IP | Global |
|-------|--------|--------|
| analyze | 60 | 400 |
| search / resolve | 60 | 400 |
| follow-up | 120 | 800 |

When `UPSTASH_REDIS_REST_*` is set, counters are shared across all serverless isolates (`X-RateLimit-Backend: upstash`). Otherwise limits are per-instance memory (`memory`). Fine for local; weak under multi-instance production traffic.
