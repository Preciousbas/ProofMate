# ProofMate

ProofMate is a token-first crypto due-diligence research assistant for the OKX AI Genesis Hackathon. Resolve a ticker or paste a contract/mint address and get an evidence-backed trust memo with visible red flags across contract transparency, holder concentration, and market liquidity.

**ProofMate is a research assistant — not a trading bot, not a security audit, and not financial advice.**

## Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Public APIs: Etherscan, Moralis, DexScreener
- Optional Groq polish for memo narrative

## Quick start (WSL)

```bash
cd ~/ProofMate
# Create .env.local with ETHERSCAN_API_KEY, MORALIS_API_KEY, and optionally GROQ_API_KEY
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ETHERSCAN_API_KEY` | Yes | Contract verification + proxy detection |
| `MORALIS_API_KEY` | Yes | Holder stats + top holders |
| `PROOFMATE_API_KEY` | Prod yes | Auth for skill HTTP routes (ASP / MCP) |
| `UPSTASH_REDIS_REST_URL` | Prod recommended | Shared rate limits across serverless isolates |
| `UPSTASH_REDIS_REST_TOKEN` | Prod recommended | Upstash REST token |
| `GROQ_API_KEY` | No | Memo polish + open-ended grounded follow-ups |
| `SOLSCAN_API_KEY` | No | Richer Solana holder / listing data |
| `ROBINHOOD_API_KEY` | No | Blockscout Pro for Robinhood Chain |
| `PROOFMATE_BASE_URL` | No | Public origin for MCP clients |

DexScreener is public and needs no API key.

## API routes

- `GET /api/search?q=PEPE&chain=all` — `search_token` skill
- `GET /api/resolve?q=ETH` — `resolve_ticker` skill (best single match)
- `GET /api/analyze?tokenAddress=0x...&chain=eth` — preferred (CDN-friendly)
- `POST /api/analyze` — `{ "tokenAddress": "0x...", "chain": "eth" }`
- `POST /api/follow-up` — `{ "question": "...", "evidence": { ... }, "memo": { ... } }`
- `GET /api/agent` — ASP / A2MCP machine-readable metadata
- `GET /api/skill` — skill manifest Markdown (source also in `SKILL.md`)
- `npm run mcp` — MCP stdio wrapper (see docs/mcp.md)

See [docs/api.md](docs/api.md), [SKILL.md](SKILL.md), [docs/mcp.md](docs/mcp.md), and [docs/demo-script.md](docs/demo-script.md).

## Demo tokens

- USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- SHIB: `0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE` (official Ethereum SHIB, Etherscan / shib.io)
- PEPE: `0x6982508145454ce325ddbe47a25d4ec3d2311933` (official Ethereum PEPE, Etherscan / pepe.vip)

## Deploy

### Vercel (primary)

```bash
npm run build
npx vercel          # preview
npx vercel --prod   # production
```

Or connect the Git repo in the [Vercel dashboard](https://vercel.com/dashboard). Framework preset: Next.js (`vercel.json` included).

Set these in Vercel → Project → Settings → Environment Variables (Production + Preview):

| Variable | Required |
|----------|----------|
| `ETHERSCAN_API_KEY` | Yes |
| `MORALIS_API_KEY` | Yes |
| `PROOFMATE_API_KEY` | Yes |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Recommended (global rate limits) |
| `GROQ_API_KEY` | No |
| `SOLSCAN_API_KEY` | No |
| `ROBINHOOD_API_KEY` / `BLOCKSCOUT_API_KEY` | No |
| `PROOFMATE_BASE_URL` | No (MCP clients; your `*.vercel.app` / custom domain) |

When `PROOFMATE_API_KEY` is set, ASP/MCP callers must send `x-api-key: <key>` or `Authorization: Bearer <key>`. The website demo uses server actions and does **not** expose the key to the browser. `/api/agent` and `/api/skill` stay public for discovery.

**Smoke after deploy:** `GET /api/agent`, then with the API key: `GET /api/resolve?q=USDC`, analyze USDC on eth, and one Solana path (e.g. BONK).

Local: `npm run dev` (API key optional for local curl).

### Netlify (alternative)

```bash
npx netlify deploy --build
npx netlify deploy --prod --build
```

Same env vars as above. Prefer Vercel for this Next.js App Router project unless you already have Netlify credits committed.


## Project structure

```
src/
  app/              # Next.js pages + API routes
  components/       # Chat UI + trust memo card
  lib/
    evidence/       # Etherscan, Moralis, DexScreener adapters
    scoring/        # Deterministic red-flag rubric
    memo/           # Template + optional LLM polish
```
