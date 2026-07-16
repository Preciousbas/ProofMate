# ProofMate MCP

Stdio MCP wrapper around the live ProofMate HTTP skills. Same tools as the ASP skill map.

## Run (API must be reachable)

```bash
# Terminal A — Next app
npm run dev

# Terminal B — MCP server (API key only needed if PROOFMATE_API_KEY is set on the app)
PROOFMATE_BASE_URL=http://localhost:3000 npm run mcp
```

On production (Vercel):

```bash
PROOFMATE_BASE_URL=https://your-app.vercel.app \
PROOFMATE_API_KEY=<same-as-vercel-env> \
npm run mcp
```

## Tools

| Tool | Maps to |
|------|---------|
| `search_token` | `GET /api/search` |
| `resolve_ticker` | `GET /api/resolve` |
| `analyze_token` | `GET /api/analyze` |
| `token_follow_up` | `POST /api/follow-up` |

## Cursor config

Add to Cursor MCP settings (`~/.cursor/mcp.json` or project config):

```json
{
  "mcpServers": {
    "proofmate": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/home/dexplorer/ProofMate",
      "env": {
        "PROOFMATE_BASE_URL": "https://your-app.vercel.app",
        "PROOFMATE_API_KEY": "<same key as Vercel>"
      }
    }
  }
}
```

## Notes

- Stdio only (stdout is JSON-RPC; logs go to stderr).
- `token_follow_up` needs the full `evidence` + `memo` objects from a prior `analyze_token` response (unchanged). The server re-scores and rejects fabricated scores/flags; answers that invent numbers fall back to the memo summary.
- When the deployed site has `PROOFMATE_API_KEY` set, MCP must send the same key via env.
