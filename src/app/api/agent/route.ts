import { NextResponse } from "next/server";
import { isAspAuthEnabled } from "@/lib/aspAuth";
import { DISCLAIMER, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/constants";
import { SUPPORTED_CHAINS } from "@/lib/chains";

export const runtime = "nodejs";

/** Machine-readable ASP / A2MCP metadata for OKX.AI reviewers and agent callers. */
export async function GET() {
  const authRequired = isAspAuthEnabled();
  return NextResponse.json(
    {
      name: PRODUCT_NAME,
      service: "ProofMate ASP — Token Due Diligence Agent",
      tagline: PRODUCT_TAGLINE,
      type: "A2MCP",
      categories: ["Finance Copilot", "Software Utility"],
      disclaimer: DISCLAIMER,
      auth: {
        required: authRequired,
        whenEnabled:
          "Set PROOFMATE_API_KEY on the server. Skill routes require x-api-key or Authorization: Bearer.",
        headers: ["x-api-key", "Authorization: Bearer <PROOFMATE_API_KEY>"],
        publicDiscovery: ["/api/agent", "/api/skill"],
      },
      chains: SUPPORTED_CHAINS.map((c) => ({
        id: c.id,
        label: c.label,
        explorer: c.explorerName,
      })),
      skills: [
        {
          id: "search_token",
          description:
            "Search tokens by ticker or name across supported chains. Returns ranked candidates.",
          method: "GET",
          path: "/api/search",
          auth: authRequired,
          query: {
            q: "PEPE | CASHCAT | …",
            chain: "optional — eth | bsc | sol | robinhood | all | …",
          },
        },
        {
          id: "resolve_ticker",
          description:
            "Resolve a ticker to one best address+chain (canonical majors or top search hit). Returns a ready analyze URL.",
          method: "GET",
          path: "/api/resolve",
          auth: authRequired,
          query: {
            q: "ETH | SOL | BNB | PEPE | …",
            chain: "optional chain filter",
          },
        },
        {
          id: "analyze_token",
          description:
            "Fetch public on-chain and market data and return a scored trust memo with red flags.",
          method: "GET",
          path: "/api/analyze",
          auth: authRequired,
          query: {
            tokenAddress: "0x… or Solana mint",
            chain: "optional — omit to auto-detect",
          },
          alternate: {
            method: "POST",
            path: "/api/analyze",
            body: { tokenAddress: "0x…", chain: "optional" },
          },
        },
        {
          id: "token_follow_up",
          description:
            "Answer a follow-up using the evidence and memo from a prior analyze call. Common questions use deterministic rules; open-ended ones use grounded Groq when configured. Server re-scores evidence; fabricated memos are rejected.",
          method: "POST",
          path: "/api/follow-up",
          auth: authRequired,
          body: {
            question: "string",
            evidence: "TokenEvidence from analyze (unchanged)",
            memo: "TrustMemo from analyze (unchanged)",
          },
        },
      ],
      workflow: [
        "resolve_ticker or search_token",
        "analyze_token",
        "token_follow_up",
      ],
      mcp: {
        transport: "stdio",
        entry: "mcp/server.ts",
        run: "PROOFMATE_BASE_URL=<origin> PROOFMATE_API_KEY=<key> npm run mcp",
        tools: [
          "search_token",
          "resolve_ticker",
          "analyze_token",
          "token_follow_up",
        ],
        docs: "/docs/mcp.md",
      },
      docs: {
        skill: "/api/skill",
        skillFile: "SKILL.md",
        api: "/docs/api.md",
        mcp: "/docs/mcp.md",
        agent: "/api/agent",
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    },
  );
}
