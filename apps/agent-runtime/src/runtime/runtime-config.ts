/**
 * Deps: infrastructure/config/runtime-bootstrap-provider.ts
 * Used By: index.ts, runtime/workflow-runtime.ts
 * Last Updated: 2026-03-20
 */
import type { LlmThinkingLevel } from "../domain/llm-thinking.js";
import { RuntimeBootstrapProvider } from "../infrastructure/config/runtime-bootstrap-provider.js";

export type RuntimeThinkingLevel = LlmThinkingLevel;
export type RuntimeSemanticMode = "off" | "auto" | "on";
export const DEFAULT_SOP_ASSET_ROOT_DIR = "~/.sasiki/sop_assets";

export interface RuntimeConfigFile {
  llm?: {
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    thinkingLevel?: RuntimeThinkingLevel;
  };
  mcp?: {
    command?: string;
    args?: string[] | string;
    env?: Record<string, string>;
  };
  cdp?: {
    endpoint?: string;
    launch?: boolean;
    userDataDir?: string;
    resetPagesOnLaunch?: boolean;
    headless?: boolean;
    injectCookies?: boolean;
    cookiesDir?: string;
    preferSystemBrowser?: boolean;
    executablePath?: string;
    startupTimeoutMs?: number;
  };
  runtime?: {
    artifactsDir?: string;
    runSystemPrompt?: string;
    refineSystemPrompt?: string;
  };
  observe?: {
    timeoutMs?: number;
  };
  semantic?: {
    mode?: RuntimeSemanticMode;
    timeoutMs?: number;
  };
  hitl?: {
    enabled?: boolean;
    retryLimit?: number;
    maxInterventions?: number;
  };
  refinement?: {
    enabled?: boolean;
    // compatibility-only switch: new react refinement path ignores mode semantics
    mode?: "filtered_view" | "full_snapshot_debug";
    maxRounds?: number;
    tokenBudget?: number;
    knowledgeTopN?: number;
  };
}

export interface RuntimeConfig {
  configPath?: string;
  mcpCommand: string;
  mcpArgs: string[];
  mcpEnv: Record<string, string>;
  cdpEndpoint: string;
  launchCdp: boolean;
  cdpUserDataDir: string;
  cdpResetPagesOnLaunch: boolean;
  cdpHeadless: boolean;
  cdpInjectCookies: boolean;
  cdpCookiesDir: string;
  cdpPreferSystemBrowser: boolean;
  cdpExecutablePath?: string;
  cdpStartupTimeoutMs: number;
  model: string;
  apiKey: string;
  baseUrl?: string;
  thinkingLevel: RuntimeThinkingLevel;
  artifactsDir: string;
  runSystemPrompt?: string;
  refineSystemPrompt?: string;
  observeTimeoutMs: number;
  sopAssetRootDir: string;
  semanticMode: RuntimeSemanticMode;
  semanticTimeoutMs: number;
  hitlEnabled: boolean;
  hitlRetryLimit: number;
  hitlMaxInterventions: number;
  refinementEnabled: boolean;
  refinementMode: "filtered_view" | "full_snapshot_debug";
  refinementMaxRounds: number;
  refinementTokenBudget: number;
  refinementKnowledgeTopN: number;
}

export interface RuntimeConfigSourceOptions {
  configPath?: string;
}

export class RuntimeConfigLoader {
  static fromSources(options?: RuntimeConfigSourceOptions): RuntimeConfig {
    return new RuntimeBootstrapProvider(options).load();
  }
}
