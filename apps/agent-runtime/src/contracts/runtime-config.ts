import type { LlmThinkingLevel } from "../domain/llm-thinking.js";
import type { RuntimeTelemetryArtifactCheckpointMode as RuntimeTelemetryArtifactCheckpointModeContract } from "./runtime-telemetry.js";

export type RuntimeThinkingLevel = LlmThinkingLevel;
export type RuntimeSemanticMode = "off" | "auto" | "on";
export type RuntimeTelemetryTerminalMode = "progress" | "agent";
export type RuntimeTelemetryArtifactCheckpointMode = RuntimeTelemetryArtifactCheckpointModeContract;
export const DEFAULT_SOP_ASSET_ROOT_DIR = "~/.sasiki/sop_assets";

export interface RuntimeTelemetryConfig {
  terminalEnabled: boolean;
  terminalMode: RuntimeTelemetryTerminalMode;
  artifactEventStreamEnabled: boolean;
  artifactCheckpointMode: RuntimeTelemetryArtifactCheckpointMode;
}

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
  telemetry?: {
    terminal?: {
      enabled?: boolean;
      mode?: RuntimeTelemetryTerminalMode;
    };
    artifacts?: {
      eventStream?: boolean;
      checkpointMode?: RuntimeTelemetryArtifactCheckpointMode;
    };
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
  telemetry: RuntimeTelemetryConfig;
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

export interface RuntimeBootstrapSources {
  configPath?: string;
  projectRoot: string;
  file?: RuntimeConfigFile;
  env: NodeJS.ProcessEnv;
}
