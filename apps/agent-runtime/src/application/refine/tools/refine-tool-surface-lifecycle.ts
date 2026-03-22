export interface RefineToolSurfaceLifecycle {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

class NoOpRefineToolSurfaceLifecycle implements RefineToolSurfaceLifecycle {
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
}

export const NO_OP_REFINE_TOOL_SURFACE_LIFECYCLE: RefineToolSurfaceLifecycle = new NoOpRefineToolSurfaceLifecycle();
