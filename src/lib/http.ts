import {
  API_TIMEOUT_MS,
  UPSTREAM_MAX_CONCURRENCY,
  UPSTREAM_MAX_RETRIES,
} from "./constants";
import { Semaphore } from "./concurrency";

const upstreamGate = new Semaphore(UPSTREAM_MAX_CONCURRENCY);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = API_TIMEOUT_MS,
): Promise<Response> {
  return upstreamGate.run(async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= UPSTREAM_MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            ...init?.headers,
          },
        });

        if (!shouldRetry(response.status) || attempt === UPSTREAM_MAX_RETRIES) {
          return response;
        }

        // Honor Retry-After when present (seconds).
        const retryAfter = response.headers.get("retry-after");
        const retryMs = retryAfter
          ? Math.min(Number(retryAfter) * 1000 || 0, 5_000)
          : 250 * 2 ** attempt;
        await sleep(Math.max(retryMs, 100));
      } catch (error) {
        lastError = error;
        if (attempt === UPSTREAM_MAX_RETRIES) throw error;
        await sleep(250 * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Upstream fetch failed for ${url}`);
  });
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithTimeout(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json() as Promise<T>;
}
