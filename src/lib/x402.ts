import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import {
  withX402,
  x402ResourceServer,
  type Network,
  type RouteConfig,
} from "@okxweb3/x402-next";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { type NextRequest, NextResponse } from "next/server";
import { hasValidAspApiKey } from "@/lib/aspAuth";
import {
  getPayToAddress,
  getX402Network,
  getX402Price,
  isX402Configured,
  X402_FEE_USDT,
  X402_PRICE,
} from "@/lib/x402Config";

export {
  getPayToAddress,
  getX402Network,
  getX402Price,
  isX402Configured,
  X402_FEE_USDT,
  X402_PRICE,
} from "@/lib/x402Config";

function networkId(): Network {
  return getX402Network() as Network;
}

let resourceServer: x402ResourceServer | null | undefined;

function getResourceServer(): x402ResourceServer | null {
  if (resourceServer !== undefined) return resourceServer;
  if (!isX402Configured()) {
    resourceServer = null;
    return null;
  }

  const facilitatorClient = new OKXFacilitatorClient({
    apiKey: process.env.OKX_API_KEY!.trim(),
    secretKey: process.env.OKX_SECRET_KEY!.trim(),
    passphrase: process.env.OKX_PASSPHRASE!.trim(),
    // Wait for facilitator confirmation so PAYMENT-RESPONSE is final.
    syncSettle: true,
    // Only pass baseUrl when set — explicit undefined overwrites the SDK default.
    ...(process.env.OKX_BASE_URL?.trim()
      ? { baseUrl: process.env.OKX_BASE_URL.trim() }
      : {}),
  });

  resourceServer = new x402ResourceServer(facilitatorClient).register(
    networkId(),
    new ExactEvmScheme(),
  );
  return resourceServer;
}

export function skillRouteConfig(description: string): RouteConfig {
  const payTo = getPayToAddress();
  if (!payTo) {
    throw new Error("PAY_TO_ADDRESS is required when x402 is configured");
  }

  return {
    accepts: {
      scheme: "exact",
      price: getX402Price(),
      network: networkId(),
      payTo,
      maxTimeoutSeconds: 300,
    },
    description,
    mimeType: "application/json",
  };
}

type AppRouteHandler = (
  request: NextRequest,
) => Promise<NextResponse> | NextResponse;

/**
 * Wrap a skill route with x402 when configured.
 *
 * - Valid PROOFMATE_API_KEY → bypass payment (MCP / owner tooling).
 * - No key + x402 on → unpaid calls get HTTP 402 with PAYMENT-REQUIRED.
 * - x402 off → handler runs; requireAspAuth inside enforces API key if set.
 *
 * withX402 is created lazily on first unpaid request so `next build` does not
 * call the OKX facilitator during page-data collection.
 */
export function withAspPayment(
  handler: AppRouteHandler,
  description: string,
): AppRouteHandler {
  let paid: AppRouteHandler | null = null;

  return async (request) => {
    if (hasValidAspApiKey(request)) {
      return handler(request);
    }

    const server = getResourceServer();
    if (!server) {
      return handler(request);
    }

    try {
      if (!paid) {
        paid = withX402(
          async (req) => handler(req),
          skillRouteConfig(description),
          server,
          undefined,
          undefined,
          // Required so exact/eip155:196 is loaded from the facilitator.
          true,
        );
      }
      return await paid(request);
    } catch (error) {
      // Reset so the next request retries facilitator sync after a transient outage.
      paid = null;
      console.error("x402 payment gate failed:", error);
      return NextResponse.json(
        {
          error:
            "Payment gate temporarily unavailable (facilitator unreachable). Retry shortly.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}

export function x402DiscoveryMeta() {
  const configured = isX402Configured();
  return {
    enabled: configured,
    protocol: "x402",
    price: getX402Price(),
    feeUsdt: X402_FEE_USDT,
    network: getX402Network(),
    payTo: configured ? getPayToAddress() : null,
    unpaidStatus: 402,
    note: configured
      ? "Unpaid skill calls return HTTP 402 with a PAYMENT-REQUIRED challenge. Replay with a signed payment header. A valid PROOFMATE_API_KEY bypasses payment for owner/MCP tooling."
      : "x402 not configured on this deployment; skill routes use PROOFMATE_API_KEY when set.",
  };
}
