export interface RefineToolSurfaceLifecycle {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface RefineToolSurfaceLifecycleParticipant {
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
}

export interface RefineToolSurfaceLifecycleCoordinatorOptions {
  participants: readonly RefineToolSurfaceLifecycleParticipant[];
}

export class RefineToolSurfaceLifecycleCoordinator implements RefineToolSurfaceLifecycle {
  private readonly participants: readonly RefineToolSurfaceLifecycleParticipant[];
  private connectedParticipants: RefineToolSurfaceLifecycleParticipant[] = [];
  private connected = false;

  constructor(options: RefineToolSurfaceLifecycleCoordinatorOptions) {
    this.participants = options.participants;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const connectedParticipants: RefineToolSurfaceLifecycleParticipant[] = [];
    try {
      for (const participant of this.participants) {
        await participant.connect?.();
        connectedParticipants.push(participant);
      }
      this.connectedParticipants = connectedParticipants;
      this.connected = true;
    } catch (error) {
      for (const participant of [...connectedParticipants].reverse()) {
        try {
          await participant.disconnect?.();
        } catch {
          // Preserve the original connect failure.
        }
      }
      this.connectedParticipants = [];
      this.connected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    const disconnectTargets = [...this.connectedParticipants].reverse();
    this.connectedParticipants = [];
    this.connected = false;

    let firstError: unknown;
    for (const participant of disconnectTargets) {
      try {
        await participant.disconnect?.();
      } catch (error) {
        firstError ??= error;
      }
    }

    if (firstError) {
      throw firstError;
    }
  }
}

class NoOpRefineToolSurfaceLifecycle implements RefineToolSurfaceLifecycle {
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
}

export const NO_OP_REFINE_TOOL_SURFACE_LIFECYCLE: RefineToolSurfaceLifecycle = new NoOpRefineToolSurfaceLifecycle();
