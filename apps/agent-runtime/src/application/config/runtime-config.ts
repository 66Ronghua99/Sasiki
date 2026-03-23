/**
 * Deps: contracts/runtime-config.ts
 * Used By: index.ts, application/shell/workflow-runtime.ts, application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type {
  RuntimeBootstrapSources as RuntimeBootstrapSourcesContract,
  RuntimeConfigSourceOptions as RuntimeConfigSourceOptionsContract,
} from "../../contracts/runtime-config.js";

export {
  DEFAULT_SOP_ASSET_ROOT_DIR,
  type RuntimeConfig,
  type RuntimeConfigFile,
  type RuntimeSemanticMode,
  type RuntimeTelemetryArtifactCheckpointMode,
  type RuntimeTelemetryConfig,
  type RuntimeTelemetryTerminalMode,
  type RuntimeThinkingLevel,
} from "../../contracts/runtime-config.js";

export interface RuntimeConfigSourceOptions extends RuntimeConfigSourceOptionsContract {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}
export type RuntimeBootstrapSources = RuntimeBootstrapSourcesContract;
