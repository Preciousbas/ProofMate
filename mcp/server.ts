import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.PROOFMATE_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

const API_KEY = process.env.PROOFMATE_API_KEY?.trim() ?? "";

function authHeaders(): Record<string, string> {
  if (!API_KEY) return {};
  return { "x-api-key": API_KEY };
}

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json", ...authHeaders() },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err =
      typeof body === "object" &&
      body &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(err);
  }
  return body;
}

async function apiPost(path: string, payload: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err =
      typeof body === "object" &&
      body &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(err);
  }
  return body;
}

const server = new McpServer({
  name: "proofmate",
  version: "0.1.0",
});

server.tool(
  "search_token",
  "Search tokens by ticker or name across ProofMate-supported chains. Returns ranked candidates.",
  {
    q: z.string().describe("Ticker or name, e.g. PEPE, CASHCAT"),
    chain: z
      .string()
      .optional()
      .describe("Optional chain id: eth, bsc, sol, robinhood, all, …"),
  },
  async ({ q, chain }) => {
    try {
      const params = new URLSearchParams({ q });
      if (chain) params.set("chain", chain);
      const data = await apiGet(`/api/search?${params.toString()}`);
      return textResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

server.tool(
  "resolve_ticker",
  "Resolve a ticker to one best address+chain (canonical majors or top search hit). Prefer this before analyze_token when you only have a symbol.",
  {
    q: z.string().describe("Ticker/symbol, e.g. ETH, SOL, BNB, PEPE"),
    chain: z
      .string()
      .optional()
      .describe("Optional chain filter"),
  },
  async ({ q, chain }) => {
    try {
      const params = new URLSearchParams({ q });
      if (chain) params.set("chain", chain);
      const data = await apiGet(`/api/resolve?${params.toString()}`);
      return textResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

server.tool(
  "analyze_token",
  "Analyze a token contract/mint and return a scored trust memo with red flags. Research only — not trading advice.",
  {
    tokenAddress: z
      .string()
      .describe("EVM 0x address or Solana mint"),
    chain: z
      .string()
      .optional()
      .describe("Optional chain id; omit to auto-detect"),
  },
  async ({ tokenAddress, chain }) => {
    try {
      const params = new URLSearchParams({ tokenAddress });
      if (chain) params.set("chain", chain);
      const data = await apiGet(`/api/analyze?${params.toString()}`);
      return textResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

server.tool(
  "token_follow_up",
  "Ask a grounded follow-up using evidence + memo from a prior analyze_token call. Does not invent numbers.",
  {
    question: z.string().describe("Follow-up question"),
    evidence: z
      .record(z.unknown())
      .describe("TokenEvidence object from analyze_token"),
    memo: z
      .record(z.unknown())
      .describe("TrustMemo object from analyze_token"),
  },
  async ({ question, evidence, memo }) => {
    try {
      const data = await apiPost("/api/follow-up", {
        question,
        evidence,
        memo,
      });
      return textResult(data);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`ProofMate MCP ready → ${BASE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
