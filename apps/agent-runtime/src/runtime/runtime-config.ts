/**
 * Deps: node:fs, node:path
 * Used By: index.ts, runtime/workflow-runtime.ts
 * Last Updated: 2026-03-06
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { LlmThinkingLevel } from "../domain/llm-thinking.js";

export type RuntimeThinkingLevel = LlmThinkingLevel;
export type RuntimeSemanticMode = "off" | "auto" | "on";
export const DEFAULT_SOP_ASSET_ROOT_DIR = "~/.sasiki/sop_assets";
const DEFAULT_ARTIFACTS_SUBDIR = path.join("artifacts", "e2e");

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
  consumption?: {
    enabled?: boolean;
    topN?: number;
    hintsLimit?: number;
    maxGuideChars?: number;
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
  sopConsumptionEnabled: boolean;
  sopConsumptionTopN: number;
  sopConsumptionHintsLimit: number;
  sopConsumptionMaxGuideChars: number;
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
    const loaded = this.loadConfigFile(options?.configPath);
    const file = loaded?.config;
    const projectRoot = this.resolveProjectRoot(loaded?.path ? path.dirname(loaded.path) : process.cwd());
    const domesticApiKey = process.env.LLM_API_KEY ?? process.env.DASHSCOPE_API_KEY;
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const baseUrl = file?.llm?.baseUrl ?? process.env.LLM_BASE_URL ?? process.env.DASHSCOPE_BASE_URL;
    const apiKey = file?.llm?.apiKey ?? domesticApiKey ?? openRouterApiKey ?? "";
    const model =
      file?.llm?.model ??
      process.env.LLM_MODEL ??
      this.defaultModel(domesticApiKey, openRouterApiKey, baseUrl);

    return {
      configPath: loaded?.path,
      mcpCommand: file?.mcp?.command ?? process.env.MCP_COMMAND ?? "npx",
      mcpArgs: this.parseArgs(file?.mcp?.args, process.env.MCP_ARGS ?? "@playwright/mcp@latest"),
      mcpEnv: file?.mcp?.env ?? {},
      cdpEndpoint: file?.cdp?.endpoint ?? process.env.PLAYWRIGHT_MCP_CDP_ENDPOINT ?? "http://localhost:9222",
      launchCdp: this.readBoolean(file?.cdp?.launch, process.env.LAUNCH_CDP, true),
      cdpUserDataDir: file?.cdp?.userDataDir ?? process.env.CDP_USER_DATA_DIR ?? "~/.sasiki/chrome_profile",
      cdpResetPagesOnLaunch: this.readBoolean(
        file?.cdp?.resetPagesOnLaunch,
        process.env.CDP_RESET_PAGES_ON_LAUNCH,
        true
      ),
      cdpHeadless: this.readBoolean(file?.cdp?.headless, process.env.CDP_HEADLESS, false),
      cdpInjectCookies: this.readBoolean(file?.cdp?.injectCookies, process.env.INJECT_COOKIES, true),
      cdpCookiesDir: file?.cdp?.cookiesDir ?? process.env.COOKIES_DIR ?? "~/.sasiki/cookies",
      cdpPreferSystemBrowser: this.readBoolean(file?.cdp?.preferSystemBrowser, process.env.PREFER_SYSTEM_BROWSER, true),
      cdpExecutablePath: file?.cdp?.executablePath ?? process.env.CHROME_EXECUTABLE_PATH,
      cdpStartupTimeoutMs: this.readPositiveInt(
        file?.cdp?.startupTimeoutMs,
        process.env.CDP_STARTUP_TIMEOUT_MS,
        30000
      ),
      model,
      apiKey,
      baseUrl,
      thinkingLevel: this.readThinkingLevel(file?.llm?.thinkingLevel, process.env.LLM_THINKING_LEVEL, "minimal"),
      artifactsDir: this.resolveArtifactsDir(projectRoot, file?.runtime?.artifactsDir, process.env.RUNTIME_ARTIFACTS_DIR),
      runSystemPrompt: this.readOptionalString(file?.runtime?.runSystemPrompt, process.env.RUNTIME_RUN_SYSTEM_PROMPT),
      refineSystemPrompt: this.readOptionalString(
        file?.runtime?.refineSystemPrompt,
        process.env.RUNTIME_REFINE_SYSTEM_PROMPT
      ),
      observeTimeoutMs: this.readPositiveInt(file?.observe?.timeoutMs, process.env.OBSERVE_TIMEOUT_MS, 120000),
      sopAssetRootDir: DEFAULT_SOP_ASSET_ROOT_DIR,
      semanticMode: this.readSemanticMode(file?.semantic?.mode, process.env.SOP_COMPACT_SEMANTIC_MODE, "auto"),
      semanticTimeoutMs: this.readPositiveInt(
        file?.semantic?.timeoutMs,
        process.env.SOP_COMPACT_SEMANTIC_TIMEOUT_MS,
        12000
      ),
      sopConsumptionEnabled: this.readBoolean(
        file?.consumption?.enabled,
        process.env.SOP_CONSUMPTION_ENABLED,
        false
      ),
      sopConsumptionTopN: this.readPositiveInt(file?.consumption?.topN, process.env.SOP_CONSUMPTION_TOP_N, 3),
      sopConsumptionHintsLimit: this.readPositiveInt(
        file?.consumption?.hintsLimit,
        process.env.SOP_CONSUMPTION_HINTS_LIMIT,
        8
      ),
      sopConsumptionMaxGuideChars: this.readPositiveInt(
        file?.consumption?.maxGuideChars,
        process.env.SOP_CONSUMPTION_MAX_GUIDE_CHARS,
        4000
      ),
      hitlEnabled: this.readBoolean(file?.hitl?.enabled, process.env.HITL_ENABLED, false),
      hitlRetryLimit: this.readNonNegativeInt(file?.hitl?.retryLimit, process.env.HITL_RETRY_LIMIT, 2),
      hitlMaxInterventions: this.readNonNegativeInt(
        file?.hitl?.maxInterventions,
        process.env.HITL_MAX_INTERVENTIONS,
        1
      ),
      refinementEnabled: this.readBoolean(file?.refinement?.enabled, process.env.REFINEMENT_ENABLED, false),
      refinementMode: this.readRefinementMode(
        file?.refinement?.mode,
        process.env.REFINEMENT_MODE,
        "filtered_view"
      ),
      refinementMaxRounds: this.readPositiveInt(file?.refinement?.maxRounds, process.env.REFINEMENT_MAX_ROUNDS, 12),
      refinementTokenBudget: this.readPositiveInt(
        file?.refinement?.tokenBudget,
        process.env.REFINEMENT_TOKEN_BUDGET,
        1000
      ),
      refinementKnowledgeTopN: this.readPositiveInt(
        file?.refinement?.knowledgeTopN,
        process.env.REFINEMENT_KNOWLEDGE_TOP_N,
        8
      ),
    };
  }

  private static defaultModel(
    domesticApiKey: string | undefined,
    openRouterApiKey: string | undefined,
    baseUrl?: string
  ): string {
    const normalizedBaseUrl = baseUrl?.trim().toLowerCase() ?? "";
    if (normalizedBaseUrl.includes("dashscope.aliyuncs.com")) {
      return "openai/qwen-plus";
    }
    if (normalizedBaseUrl.includes("openrouter.ai")) {
      return "openai/openrouter/auto";
    }
    if (domesticApiKey) {
      return "minimax/MiniMax-M2.5";
    }
    if (openRouterApiKey) {
      return "openrouter/openrouter/auto";
    }
    return "openai/gpt-4o-mini";
  }

  private static parseBool(value: string | undefined, fallback: boolean): boolean {
    if (!value) {
      return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private static parseInt(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private static parseArgs(value: string[] | string | undefined, fallback: string): string[] {
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof value === "string") {
      return value.split(" ").filter(Boolean);
    }
    return fallback.split(" ").filter(Boolean);
  }

  private static readOptionalString(configValue: string | undefined, envValue: string | undefined): string | undefined {
    const value = typeof configValue === "string" && configValue.trim() ? configValue : envValue;
    if (!value || !value.trim()) {
      return undefined;
    }
    return value.trim();
  }

  private static readBoolean(configValue: boolean | undefined, envValue: string | undefined, fallback: boolean): boolean {
    if (typeof configValue === "boolean") {
      return configValue;
    }
    return this.parseBool(envValue, fallback);
  }

  private static readPositiveInt(
    configValue: number | undefined,
    envValue: string | undefined,
    fallback: number
  ): number {
    if (typeof configValue === "number" && Number.isFinite(configValue) && configValue > 0) {
      return Math.floor(configValue);
    }
    return this.parseInt(envValue, fallback);
  }

  private static readNonNegativeInt(
    configValue: number | undefined,
    envValue: string | undefined,
    fallback: number
  ): number {
    if (typeof configValue === "number" && Number.isFinite(configValue) && configValue >= 0) {
      return Math.floor(configValue);
    }
    if (!envValue) {
      return fallback;
    }
    const parsed = Number.parseInt(envValue, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  private static readThinkingLevel(
    configValue: RuntimeThinkingLevel | undefined,
    envValue: string | undefined,
    fallback: RuntimeThinkingLevel
  ): RuntimeThinkingLevel {
    if (this.isThinkingLevel(configValue)) {
      return configValue;
    }
    if (this.isThinkingLevel(envValue)) {
      return envValue;
    }
    return fallback;
  }

  private static readSemanticMode(
    configValue: RuntimeSemanticMode | undefined,
    envValue: string | undefined,
    fallback: RuntimeSemanticMode
  ): RuntimeSemanticMode {
    if (this.isSemanticMode(configValue)) {
      return configValue;
    }
    if (this.isSemanticMode(envValue)) {
      return envValue;
    }
    return fallback;
  }

  private static readRefinementMode(
    configValue: RuntimeConfig["refinementMode"] | undefined,
    envValue: string | undefined,
    fallback: RuntimeConfig["refinementMode"]
  ): RuntimeConfig["refinementMode"] {
    if (configValue === "filtered_view" || configValue === "full_snapshot_debug") {
      return configValue;
    }
    const normalized = envValue?.trim().toLowerCase();
    if (normalized === "filtered_view" || normalized === "full_snapshot_debug") {
      return normalized;
    }
    return fallback;
  }

  private static resolveArtifactsDir(root: string, configValue: string | undefined, envValue: string | undefined): string {
    if (configValue?.trim()) {
      const normalized = configValue.trim();
      return path.isAbsolute(normalized) ? normalized : path.join(root, normalized);
    }
    if (envValue?.trim()) {
      const normalized = envValue.trim();
      return path.isAbsolute(normalized) ? normalized : path.join(root, normalized);
    }
    return path.join(root, DEFAULT_ARTIFACTS_SUBDIR);
  }

  private static resolveProjectRoot(startDir: string): string {
    let current = path.resolve(startDir);
    while (true) {
      if (existsSync(path.join(current, ".git"))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return path.resolve(process.cwd());
      }
      current = parent;
    }
  }

  private static isThinkingLevel(value: string | undefined): value is RuntimeThinkingLevel {
    return value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
  }

  private static isSemanticMode(value: string | undefined): value is RuntimeSemanticMode {
    return value === "off" || value === "auto" || value === "on";
  }

  private static loadConfigFile(
    explicitPath?: string
  ): { path: string; config: RuntimeConfigFile } | undefined {
    const candidates = this.configCandidates(explicitPath);
    for (const candidate of candidates) {
      const absolute = path.resolve(candidate);
      if (!existsSync(absolute)) {
        continue;
      }
      const raw = readFileSync(absolute, "utf-8");
      const parsed = JSON.parse(raw) as RuntimeConfigFile;
      return { path: absolute, config: parsed };
    }
    if (explicitPath) {
      throw new Error(`runtime config file not found: ${path.resolve(explicitPath)}`);
    }
    return undefined;
  }

  private static configCandidates(explicitPath?: string): string[] {
    const paths: string[] = [];
    if (explicitPath?.trim()) {
      paths.push(explicitPath.trim());
    }
    const fromEnv = process.env.RUNTIME_CONFIG_PATH;
    if (fromEnv?.trim()) {
      paths.push(fromEnv.trim());
    }
    paths.push(path.resolve(process.cwd(), "runtime.config.json"));
    paths.push(path.resolve(process.cwd(), "apps/agent-runtime/runtime.config.json"));
    return paths;
  }
}
