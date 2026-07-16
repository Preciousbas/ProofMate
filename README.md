# ProofMate

ProofMate looks up a ticker or contract and returns a trust memo with public red flags on the contract, holders, and liquidity. Built for the OKX AI Genesis Hackathon.

**ProofMate is a research assistant, not a trading bot, security audit, or financial advice.**

## Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Auth.js (Google OAuth) + Neon Postgres (Drizzle) for per-user chats
- Public APIs: Etherscan, Moralis, DexScreener
- Optional Groq for memo wording and open follow-ups

## Quick start (WSL)

```bash
cd ~/ProofMate
# Create .env.local — see Environment variables below
npm install
npm run db:push   # after DATABASE_URL is set
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You can try the chat as a guest (history clears on refresh) or sign in with **Google** or **email** to keep chats.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ETHERSCAN_API_KEY` | Yes | Contract verification + proxy detection |
| `MORALIS_API_KEY` | Yes | Holder stats + top holders (EVM and Solana) |
| `AUTH_SECRET` | Yes | Auth.js session encryption (`openssl rand -base64 32`) |
| `AUTH_URL` | Yes | App origin (`http://localhost:3000` locally) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | For Google | Google OAuth (email/password works without these) |
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `PROOFMATE_API_KEY` | Prod yes | Auth for skill HTTP routes (ASP / MCP) |
| `UPSTASH_REDIS_REST_URL` | Prod recommended | Shared rate limits across serverless isolates |
| `UPSTASH_REDIS_REST_TOKEN` | Prod recommended | Upstash REST token |
| `GROQ_API_KEY` | No | Memo polish + open follow-ups |
| `PROOFMATE_SKIP_MEMO_POLISH` | No | Set `1` to skip Groq memo polish (faster analyzes) |
| `PROOFMATE_FOLLOW_UP_LLM` | No | Set `0` to turn off open Groq follow-ups (rules only) |
| `SOLSCAN_API_KEY` | No | Solscan Pro key for richer Solana holders / curated listing |
| `ROBINHOOD_API_KEY` | No | Blockscout Pro for Robinhood Chain |
| `PROOFMATE_BASE_URL` | No | Public origin for MCP clients |

DexScreener is public and needs no API key.

Without Solscan Pro, Solana still uses RPC + Moralis. Solana "Verified" means a Solscan curated listing (or WSOL), not merely revoked mint/freeze authorities.

### Google OAuth setup

1. Create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (Web application).
2. Add authorized redirect URI: `{AUTH_URL}/api/auth/callback/google`.
3. Copy Client ID / Secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

### Postgres (Neon)

1. Provision Neon via [Vercel Marketplace](https://vercel.com/marketplace) (`vercel integration add neon`) or [neon.tech](https://neon.tech).
2. Set `DATABASE_URL` to the pooled connection string.
3. Push schema: `npm run db:push`.

Signed-in chats are stored per user. Log out clears the Auth.js session and returns to `/login`.

You can sign in with **Google** or an **email + password** account (create one from the login page). Google-only emails cannot create a password account for the same address; use Continue with Google instead.

## API routes

- `GET /api/search?q=PEPE&chain=all` — `search_token` skill
- `GET /api/resolve?q=ETH` — `resolve_ticker` skill (best single match)
- `GET /api/analyze?tokenAddress=0x...&chain=eth` — preferred (cache-friendly)
- `POST /api/analyze` — `{ "tokenAddress": "0x...", "chain": "eth" }`
- `POST /api/follow-up` — `{ "question": "...", "evidence": { ... }, "memo": { ... } }`
- `GET /api/agent` — ASP / A2MCP metadata for agents
- `GET /api/skill` — skill manifest Markdown (also in `SKILL.md`)
- `npm run mcp` — MCP stdio wrapper (see docs/mcp.md)

See [docs/api.md](docs/api.md), [SKILL.md](SKILL.md), and [docs/mcp.md](docs/mcp.md).

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
| `AUTH_SECRET` | Yes |
| `AUTH_URL` | Yes (your production URL) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Yes |
| `DATABASE_URL` | Yes |
| `PROOFMATE_API_KEY` | Yes |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Recommended (global rate limits) |
| `GROQ_API_KEY` | No |
| `PROOFMATE_SKIP_MEMO_POLISH` | No (set `1` for faster demos) |
| `PROOFMATE_FOLLOW_UP_LLM` | No (set `0` to disable open LLM follow-ups) |
| `SOLSCAN_API_KEY` | No (Solscan Pro only) |
| `ROBINHOOD_API_KEY` / `BLOCKSCOUT_API_KEY` | No |
| `PROOFMATE_BASE_URL` | No (MCP clients; your `*.vercel.app` / custom domain) |

Run `npm run db:push` against production `DATABASE_URL` once (or use Drizzle migrations) before users sign in. Add the production Google redirect URI: `https://<your-domain>/api/auth/callback/google`.

When `PROOFMATE_API_KEY` is set, ASP/MCP callers must send `x-api-key: <key>` or `Authorization: Bearer <key>`. The website demo uses server actions and does **not** expose the key to the browser. `/api/agent` and `/api/skill` stay public for discovery.

**Smoke after deploy:** `GET /api/agent`, then with the API key: `GET /api/resolve?q=USDC`, analyze USDC on eth, and one follow-up question.

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
    evidence/       # Explorers, Moralis, DexScreener, Solana
    scoring/        # Deterministic red-flag rubric
    memo/           # Template + optional LLM polish
```
