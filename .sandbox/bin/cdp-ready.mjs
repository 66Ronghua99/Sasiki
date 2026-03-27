import { readFileSync } from "node:fs";

export async function waitForCdpEndpointReady(
  endpoint,
  { timeoutMs = 30_000, intervalMs = 500, fetchImpl = fetch } = {}
) {
  const normalized = String(endpoint ?? "").trim().replace(/\/$/, "");
  if (!normalized) {
    throw new Error("CDP endpoint is required");
  }

  const readyUrl = `${normalized}/json/version`;
  const start = Date.now();
  let lastError = "endpoint did not respond";

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetchImpl(readyUrl);
      if (response.ok) {
        return { readyUrl };
      }
      lastError = `${response.status} ${response.statusText}`.trim();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(intervalMs);
  }

  throw new Error(`CDP endpoint not ready within ${timeoutMs}ms: ${normalized}; last error: ${lastError}`);
}

export async function waitForCdpEndpointReadyFromConfig(configPath, options) {
  const raw = readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);
  const endpoint = config?.cdp?.endpoint?.trim() || "http://127.0.0.1:9222";
  const timeoutMs = options?.timeoutMs ?? config?.cdp?.startupTimeoutMs ?? 30_000;
  return waitForCdpEndpointReady(endpoint, { ...options, timeoutMs });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
