/**
 * Deps: contracts/tool-client.ts, runtime/replay-refinement/*
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { ToolClient } from "../../contracts/tool-client.js";
import { createRefineReactSession } from "../../runtime/replay-refinement/refine-react-session.js";
import { RefineReactToolClient } from "../../runtime/replay-refinement/refine-react-tool-client.js";

export interface ToolSurfaceSelection {
  toolSurfaceKind: "refine-react";
  runToolClient: ToolClient;
  refineToolClient: RefineReactToolClient;
}

export class ToolSurfaceProvider {
  select(options: { rawClient: ToolClient }): ToolSurfaceSelection {
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
