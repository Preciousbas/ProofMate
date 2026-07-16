import { fetchJson } from "../http";

export interface EtherscanSourceResult {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  Proxy: string;
  Implementation: string;
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: EtherscanSourceResult[] | string;
}

export interface ContractVerification {
  verified: boolean;
  /** Solidity class name from verified source (e.g. TokenMintERC20Token) — NOT the ERC-20 token ticker */
  solidityClassName?: string;
  isProxy: boolean;
  implementation?: string;
  sourceAvailable: boolean;
  compilerVersion?: string;
  /** Raw verified source (may be JSON multi-file blob from explorers) */
  sourceCode?: string;
  /** Contract ABI JSON string when verified */
  abi?: string;
  error?: string;
}

export interface Erc20TokenIdentity {
  name?: string;
  symbol?: string;
  available: boolean;
  error?: string;
}

const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";

/** ERC-20 name() selector */
const NAME_SELECTOR = "0x06fdde03";
/** ERC-20 symbol() selector */
const SYMBOL_SELECTOR = "0x95d89b41";

function decodeAbiString(hexData: string): string | undefined {
  const hex = hexData.startsWith("0x") ? hexData.slice(2) : hexData;
  if (!hex || hex.length < 128) return undefined;

  try {
    // Dynamic string ABI encoding: offset (32 bytes) + length (32 bytes) + data
    const length = Number.parseInt(hex.slice(64, 128), 16);
    if (!Number.isFinite(length) || length <= 0 || length > 256) return undefined;
    const dataHex = hex.slice(128, 128 + length * 2);
    if (dataHex.length < length * 2) return undefined;

    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Number.parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
    }
    const text = new TextDecoder("utf-8").decode(bytes).replace(/\0/g, "").trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

async function ethCall(
  tokenAddress: string,
  data: string,
  apiKey: string,
  chainId: string,
): Promise<string | undefined> {
  const params = new URLSearchParams({
    chainid: chainId,
    module: "proxy",
    action: "eth_call",
    to: tokenAddress,
    data,
    tag: "latest",
    apikey: apiKey,
  });

  const response = await fetchJson<
    { result?: string; error?: { message?: string }; message?: string; status?: string }
  >(`${ETHERSCAN_BASE}?${params.toString()}`);

  // Rate-limit / NOTOK responses often come back as HTTP 200 with a string result
  if (
    response.error?.message ||
    response.status === "0" ||
    !response.result ||
    response.result === "0x" ||
    !response.result.startsWith("0x")
  ) {
    return undefined;
  }

  return response.result;
}

/**
 * Reads ERC-20 name()/symbol() on-chain — matches Etherscan /token/ page identity,
 * not the Solidity class name from /address/...#code.
 * Calls are sequential to stay under free-tier Etherscan rate limits.
 */
export async function getErc20TokenIdentity(
  tokenAddress: string,
  chainId = "1",
): Promise<Erc20TokenIdentity> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return {
      available: false,
      error: "Etherscan API key not configured",
    };
  }

  try {
    const nameHex = await ethCall(tokenAddress, NAME_SELECTOR, apiKey, chainId);
    const symbolHex = await ethCall(tokenAddress, SYMBOL_SELECTOR, apiKey, chainId);

    const name = nameHex ? decodeAbiString(nameHex) : undefined;
    const symbol = symbolHex ? decodeAbiString(symbolHex) : undefined;

    if (!name && !symbol) {
      return {
        available: false,
        error: "Could not decode ERC-20 name/symbol",
      };
    }

    return { name, symbol, available: true };
  } catch (error) {
    return {
      available: false,
      error:
        error instanceof Error ? error.message : "Etherscan eth_call failed",
    };
  }
}

export async function getContractVerification(
  tokenAddress: string,
  chainId = "1",
): Promise<ContractVerification> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return {
      verified: false,
      isProxy: false,
      sourceAvailable: false,
      error: "Etherscan API key not configured",
    };
  }

  try {
    const params = new URLSearchParams({
      chainid: chainId,
      module: "contract",
      action: "getsourcecode",
      address: tokenAddress,
      apikey: apiKey,
    });

    const data = await fetchJson<EtherscanResponse>(
      `${ETHERSCAN_BASE}?${params.toString()}`,
    );

    const result = Array.isArray(data.result) ? data.result[0] : undefined;
    if (!result) {
      return {
        verified: false,
        isProxy: false,
        sourceAvailable: false,
        error: "No contract data returned",
      };
    }

    const hasSource =
      Boolean(result.SourceCode) &&
      result.SourceCode !== "Contract source code not verified";
    const isProxy = result.Proxy === "1";
    const implementation = result.Implementation || undefined;

    return {
      verified: hasSource,
      solidityClassName: result.ContractName || undefined,
      isProxy,
      implementation: implementation || undefined,
      sourceAvailable: hasSource,
      compilerVersion: result.CompilerVersion || undefined,
      sourceCode: hasSource ? result.SourceCode : undefined,
      abi:
        hasSource && result.ABI && result.ABI !== "Contract source code not verified"
          ? result.ABI
          : undefined,
    };
  } catch (error) {
    return {
      verified: false,
      isProxy: false,
      sourceAvailable: false,
      error: error instanceof Error ? error.message : "Etherscan request failed",
    };
  }
}

/** Prefer the token page (name/symbol/holders), not the Solidity #code view. */
export function etherscanSourceUrl(
  tokenAddress: string,
  explorerTokenUrl?: string,
): string {
  if (explorerTokenUrl) {
    return explorerTokenUrl.replace("{address}", tokenAddress);
  }
  return `https://etherscan.io/token/${tokenAddress}`;
}

/** Total supply from Etherscan-family explorers (works on free ETH plan). */
export async function getTokenTotalSupply(
  tokenAddress: string,
  chainId = "1",
  decimals = 18,
): Promise<{ totalSupplyFormatted?: string; available: boolean; error?: string }> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return { available: false, error: "Etherscan API key not configured" };
  }

  try {
    const params = new URLSearchParams({
      chainid: chainId,
      module: "stats",
      action: "tokensupply",
      contractaddress: tokenAddress,
      apikey: apiKey,
    });
    const data = await fetchJson<{
      status?: string;
      message?: string;
      result?: string;
    }>(`${ETHERSCAN_BASE}?${params.toString()}`);

    if (data.status !== "1" || !data.result || !/^\d+$/.test(data.result)) {
      return {
        available: false,
        error: data.result || data.message || "Token supply unavailable",
      };
    }

    const raw = BigInt(data.result);
    const base = BigInt(10) ** BigInt(decimals);
    const whole = raw / base;
    const frac = raw % base;
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    const formatted = fracStr
      ? `${whole.toLocaleString()}.${fracStr.slice(0, 6)}`
      : whole.toLocaleString();

    return { totalSupplyFormatted: formatted, available: true };
  } catch (error) {
    return {
      available: false,
      error:
        error instanceof Error ? error.message : "Etherscan supply request failed",
    };
  }
}
