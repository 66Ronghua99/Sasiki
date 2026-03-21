/**
 * Deps: application/config/runtime-config.ts, infrastructure/config/runtime-bootstrap-provider.ts
 * Used By: index.ts, tests
 * Last Updated: 2026-03-21
 */
import { RuntimeBootstrapProvider } from "../../infrastructure/config/runtime-bootstrap-provider.js";
import type { RuntimeConfig, RuntimeConfigSourceOptions } from "./runtime-config.js";

export class RuntimeConfigLoader {
  static fromSources(options?: RuntimeConfigSourceOptions): RuntimeConfig {
    return new RuntimeBootstrapProvider(options).load();
  }
}
