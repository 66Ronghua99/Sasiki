import type { SasikiDesktopApi } from "../../../shared/ipc/contracts";

export function resolveDesktopClient(api?: SasikiDesktopApi): SasikiDesktopApi | undefined {
  if (api) {
    return api;
  }

  if (typeof window === "undefined" || !("sasiki" in window) || !window.sasiki) {
    return undefined;
  }

  return window.sasiki;
}

export function createDesktopClient(api?: SasikiDesktopApi): SasikiDesktopApi {
  const resolved = resolveDesktopClient(api);
  if (!resolved) {
    throw new Error("desktop bridge window.sasiki is not available");
  }

  return resolved;
}
