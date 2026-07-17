# ProofMate ASP — Skill Manifest

**Service:** ProofMate ASP — Token Due Diligence Agent  
**Type:** A2MCP (Agent-to-MCP / HTTP)  
**About:** Research assistant for token red flags. Not trading. Not financial advice.

Live discovery: `GET /api/agent` · skill Markdown: `GET /api/skill`

## Auth & payment (x402)

Protected skills: `search_token`, `resolve_ticker`, `analyze_token`, `token_follow_up`.  
Public: `/api/agent`, `/api/skill`.

When OKX x402 is configured (`OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`, `PAY_TO_ADDRESS`):

- Unpaid skill calls return **HTTP 402** with a standard `PAYMENT-REQUIRED` challenge (**$0.01** / call on X Layer `eip155:196` by default).
- Replay with a signed payment header to receive **200**.
- Optional owner/MCP bypass: `x-api-key: <PROOFMATE_API_KEY>` or `Authorization: Bearer <PROOFMATE_API_KEY>` (skips payment).

When x402 is not configured and `PROOFMATE_API_KEY` is set, skill calls require the API key (HTTP 401 if missing).

## Skills

### `search_token`

| | |
|--|--|
| **Input** | `q` — ticker or name (e.g. `PEPE`, `CASHCAT`); optional `chain` (`eth`, `bsc`, `sol`, `robinhood`, `all`, …) |
| **Method** | `GET /api/search?q=PEPE&chain=all` |
| **Output** | `{ results: TokenSearchHit[] }` — ranked candidates with `chainId`, `address`, `symbol`, liquidity |
| **Behavior** | DexScreener search across supported chains. Prefer `resolve_ticker` when you need a single pick. |

### `resolve_ticker`

| | |
|--|--|
| **Input** | `q` — ticker/symbol; optional `chain` |
| **Method** | `GET /api/resolve?q=ETH` or `GET /api/resolve?q=PEPE&chain=eth` |
| **Output** | `{ hit, via, candidates, note?, next }` — one best match + a ready `analyze_token` URL |
| **Behavior** | Known majors (ETH→WETH, BNB→WBNB, SOL→wrapped SOL, …) use canonical contracts; otherwise top search hit. |

### `analyze_token`

| | |
|--|--|
| **Input** | `tokenAddress` — EVM `0x…` or Solana mint; optional `chain` (`eth`, `bsc`, `sol`, `robinhood`, …). Omit `chain` to auto-detect. |
| **Method** | `GET /api/analyze?tokenAddress=…&chain=…` (preferred) or `POST /api/analyze` |
| **Output** | `memo`, `evidence`, `sessionId` |
| **Behavior** | Pulls public evidence (explorers, Moralis, DexScreener, Blockscout, Solana RPC / optional Solscan Pro) → score 0–100 + trust memo with red flags. On Solana, Verified means a Solscan curated listing (or WSOL), not merely revoked mint/freeze. |

### `token_follow_up`

| | |
|--|--|
| **Input** | `question`, `evidence`, `memo` (from a prior `analyze_token`) |
| **Method** | `POST /api/follow-up` |
| **Output** | `answer`, `grounded`, optional `source` (`rules` \| `llm` \| `fallback`) |
| **Behavior** | Common questions use deterministic rules. Open questions may use Groq when `GROQ_API_KEY` is set and `PROOFMATE_FOLLOW_UP_LLM` is not `0`; answers that invent numbers not in the memo/evidence are rejected and fall back. Server re-scores evidence and rejects fabricated score/flag payloads (ask the user to analyze again after a scoring deploy). |

## Supported chains (skill surface)

Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, Robinhood (Blockscout), Blast, Linea, Scroll, Berachain, Abstract, World Chain, Soneium, Solana.

Coverage depth varies: market data via DexScreener for all; holders/contract depend on explorer + Moralis support for that chain.

## Constraints

- Public data only. Not a security audit or trading signal.
- Missing upstream data → caution / unavailable flags, never “safe”.
- Always surface the product disclaimer to end users.
- `resolve_ticker` can pick a wrong duplicate ticker. When unsure, call `search_token` and disambiguate.

## Example: resolve then analyze

```http
GET /api/resolve?q=ETH
```

Then follow `next.path`, e.g.:

```http
GET /api/analyze?tokenAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&chain=eth
```

## Example: search

```http
GET /api/search?q=PEPE&chain=all
```

## Example: follow-up

```http
POST /api/follow-up
Content-Type: application/json
x-api-key: <PROOFMATE_API_KEY>

{
  "question": "Why is the risk score this high?",
  "evidence": { "...": "from analyze response" },
  "memo": { "...": "from analyze response" }
}
```

## Suggested agent workflow

1. **Resolve** — ticker → address+chain (`resolve_ticker` or `search_token`)
2. **Analyze** — public evidence → scored trust memo
3. **Explain** — follow-ups on holders, liquidity, contract, score

## Machine metadata

`GET /api/agent` — JSON service description and skill map.  
`GET /api/skill` — this manifest as Markdown.  
MCP (stdio): `PROOFMATE_BASE_URL=<origin> PROOFMATE_API_KEY=<key> npm run mcp` — see `docs/mcp.md`.
