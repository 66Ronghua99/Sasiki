import type {
  RuntimeEvent,
  RuntimeEventBus,
  RuntimeRunTelemetry,
  RuntimeRunTelemetryArtifacts,
  RuntimeRunTelemetryScope,
  RuntimeTelemetryRegistry,
  RuntimeTelemetrySink,
} from "../../contracts/runtime-telemetry.js";

export interface RuntimeTelemetryRegistryOptions {
  createSinks(scope: RuntimeRunTelemetryScope): RuntimeTelemetrySink[];
  createArtifacts?(scope: RuntimeRunTelemetryScope): RuntimeRunTelemetryArtifacts;
}

export function createRuntimeTelemetryRegistry(options: RuntimeTelemetryRegistryOptions): RuntimeTelemetryRegistry {
  return {
    createRunTelemetry(scope: RuntimeRunTelemetryScope): RuntimeRunTelemetry {
      const sinks = options.createSinks(scope);
      const artifacts =
        options.createArtifacts?.(scope) ??
        ({
          scope,
          artifactsDir: scope.artifactsDir,
          checkpointMode: "off" as const,
          checkpoints: {
            append: async () => undefined,
            dispose: async () => undefined,
          },
          async dispose(): Promise<void> {
            await this.checkpoints.dispose();
          },
        } satisfies RuntimeRunTelemetryArtifacts);
      let queue = Promise.resolve();

      const eventBus: RuntimeEventBus = {
        emit: async (event: RuntimeEvent): Promise<void> => {
          const next = queue.then(async () => {
            for (const sink of sinks) {
              await sink.emit(event);
            }
          });
          queue = next.then(
            () => undefined,
            () => undefined
          );
          return next;
        },
        dispose: async (): Promise<void> => {
          await queue;
          for (const sink of sinks) {
            if (sink.dispose) {
              await sink.dispose();
            }
          }
        },
      };

      return {
        eventBus,
        artifacts,
        async dispose(): Promise<void> {
          await eventBus.dispose();
          await artifacts.dispose();
        },
      };
    },
  };
}
