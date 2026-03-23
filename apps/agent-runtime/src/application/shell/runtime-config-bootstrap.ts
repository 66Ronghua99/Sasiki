/**
 * Deps: application/config/runtime-config-loader.ts, infrastructure/config/runtime-bootstrap-provider.ts
 * Used By: index.ts, tests
 * Last Updated: 2026-03-23
 */
import { RuntimeConfigLoader } from "../config/runtime-config-loader.js";
import type { RuntimeConfig, RuntimeConfigSourceOptions } from "../config/runtime-config.js";
import { loadRuntimeBootstrapSources } from "../../infrastructure/config/runtime-bootstrap-provider.js";

export function loadRuntimeConfig(options?: RuntimeConfigSourceOptions): RuntimeConfig {
  return RuntimeConfigLoader.fromBootstrapSources(loadRuntimeBootstrapSources(options));
}
