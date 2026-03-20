/**
 * Deps: contracts/tool-client.ts, runtime/replay-refinement/*
 * Used By: runtime/runtime-composition-root.ts
 * Last Updated: 2026-03-20
 */
import type { ToolClient } from "../../contracts/tool-client.js";
import { createRefineReactSession } from "../replay-refinement/refine-react-session.js";
import { RefineReactToolClient } from "../replay-refinement/refine-react-tool-client.js";

export interface ToolSurfaceSelection {
  toolSurfaceKind: "raw" | "refine-react";
  runToolClient: ToolClient;
  refineToolClient?: RefineReactToolClient;
}

export class ToolSurfaceProvider {
  select(options: { rawClient: ToolClient; refinementEnabled: boolean }): ToolSurfaceSelection {
    if (!options.refinementEnabled) {
      return {
        toolSurfaceKind: "raw",
        runToolClient: options.rawClient,
      };
    }

    const refineToolClient = new RefineReactToolClient({
      rawClient: options.rawClient,
      session: createRefineReactSession("bootstrap", "bootstrap", { taskScope: "bootstrap" }),
    });

    return {
      toolSurfaceKind: "refine-react",
      runToolClient: refineToolClient,
      refineToolClient,
    };
  }
}
