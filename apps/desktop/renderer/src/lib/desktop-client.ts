import type { SasikiDesktopApi } from "../../../shared/ipc/contracts";

export function createDesktopClient(api?: SasikiDesktopApi): SasikiDesktopApi {
  if (api) {
    return api;
  }

  if (typeof window === "undefined" || !("sasiki" in window) || !window.sasiki) {
    throw new Error("desktop bridge window.sasiki is not available");
  }

  return window.sasiki;
}

