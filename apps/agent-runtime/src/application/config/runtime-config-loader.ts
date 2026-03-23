/**
 * Deps: application/config/runtime-config.ts
 * Used By: application/shell/runtime-config-bootstrap.ts, tests
 * Last Updated: 2026-03-23
 */
import path from "node:path";
import {
  DEFAULT_SOP_ASSET_ROOT_DIR,
  type RuntimeBootstrapSources,
  type RuntimeConfig,
  type RuntimeSemanticMode,
  type RuntimeTelemetryArtifactCheckpointMode,
  type RuntimeTelemetryTerminalMode,
  type RuntimeThinkingLevel,
} from "./runtime-config.js";

const DEFAULT_ARTIFACTS_SUBDIR = path.join("artifacts", "e2e");

export class RuntimeConfigLoader {
  static fromBootstrapSources(sources: RuntimeBootstrapSources): RuntimeConfig {
    const file = sources.file;
    const env = sources.env;
    const domesticApiKey = env.LLM_API_KEY ?? env.DASHSCOPE_API_KEY;
    const openRouterApiKey = env.OPENROUTER_API_KEY;
    const baseUrl = file?.llm?.baseUrl ?? env.LLM_BASE_URL ?? env.DASHSCOPE_BASE_URL;
    const apiKey = file?.llm?.apiKey ?? domesticApiKey ?? openRouterApiKey ?? "";
    const model =
      file?.llm?.model ??
      env.LLM_MODEL ??
      RuntimeConfigLoader.defaultModel(domesticApiKey, openRouterApiKey, baseUrl);

    return {
      configPath: sources.configPath,
      mcpCommand: file?.mcp?.command ?? env.MCP_COMMAND ?? "npx",
      mcpArgs: RuntimeConfigLoader.parseArgs(file?.mcp?.args, env.MCP_ARGS ?? "@playwright/mcp@latest"),
      mcpEnv: file?.mcp?.env ?? {},
      cdpEndpoint: file?.cdp?.endpoint ?? env.PLAYWRIGHT_MCP_CDP_ENDPOINT ?? "http://localhost:9222",
      launchCdp: RuntimeConfigLoader.readBoolean(file?.cdp?.launch, env.LAUNCH_CDP, true),
      cdpUserDataDir: file?.cdp?.userDataDir ?? env.CDP_USER_DATA_DIR ?? "~/.sasiki/chrome_profile",
      cdpResetPagesOnLaunch: RuntimeConfigLoader.readBoolean(
        file?.cdp?.resetPagesOnLaunch,
        env.CDP_RESET_PAGES_ON_LAUNCH,
        true
      ),
      cdpHeadless: RuntimeConfigLoader.readBoolean(file?.cdp?.headless, env.CDP_HEADLESS, false),
      cdpInjectCookies: RuntimeConfigLoader.readBoolean(file?.cdp?.injectCookies, env.INJECT_COOKIES, true),
      cdpCookiesDir: file?.cdp?.cookiesDir ?? env.COOKIES_DIR ?? "~/.sasiki/cookies",
      cdpPreferSystemBrowser: RuntimeConfigLoader.readBoolean(
        file?.cdp?.preferSystemBrowser,
        env.PREFER_SYSTEM_BROWSER,
        true
      ),
      cdpExecutablePath: file?.cdp?.executablePath ?? env.CHROME_EXECUTABLE_PATH,
      cdpStartupTimeoutMs: RuntimeConfigLoader.readPositiveInt(
        file?.cdp?.startupTimeoutMs,
        env.CDP_STARTUP_TIMEOUT_MS,
        30000
      ),
      model,
      apiKey,
      baseUrl,
      thinkingLevel: RuntimeConfigLoader.readThinkingLevel(file?.llm?.thinkingLevel, env.LLM_THINKING_LEVEL, "minimal"),
      artifactsDir: RuntimeConfigLoader.resolveArtifactsDir(
        sources.projectRoot,
        file?.runtime?.artifactsDir,
        env.RUNTIME_ARTIFACTS_DIR
      ),
      runSystemPrompt: RuntimeConfigLoader.readOptionalString(
        file?.runtime?.runSystemPrompt,
        env.RUNTIME_RUN_SYSTEM_PROMPT
      ),
      refineSystemPrompt: RuntimeConfigLoader.readOptionalString(
        file?.runtime?.refineSystemPrompt,
        env.RUNTIME_REFINE_SYSTEM_PROMPT
      ),
      telemetry: {
        terminalEnabled: RuntimeConfigLoader.readBoolean(
          file?.telemetry?.terminal?.enabled,
          env.TELEMETRY_TERMINAL_ENABLED,
          true
        ),
        terminalMode: RuntimeConfigLoader.readTelemetryTerminalMode(
          file?.telemetry?.terminal?.mode,
          env.TELEMETRY_TERMINAL_MODE,
          "agent"
        ),
        artifactEventStreamEnabled: RuntimeConfigLoader.readBoolean(
          file?.telemetry?.artifacts?.eventStream,
          env.TELEMETRY_ARTIFACT_EVENT_STREAM_ENABLED,
          true
        ),
        artifactCheckpointMode: RuntimeConfigLoader.readTelemetryArtifactCheckpointMode(
          file?.telemetry?.artifacts?.checkpointMode,
          env.TELEMETRY_ARTIFACT_CHECKPOINT_MODE,
          "key_turns"
        ),
      },
      observeTimeoutMs: RuntimeConfigLoader.readPositiveInt(file?.observe?.timeoutMs, env.OBSERVE_TIMEOUT_MS, 120000),
      sopAssetRootDir: DEFAULT_SOP_ASSET_ROOT_DIR,
      semanticMode: RuntimeConfigLoader.readSemanticMode(file?.semantic?.mode, env.SOP_COMPACT_SEMANTIC_MODE, "auto"),
      semanticTimeoutMs: RuntimeConfigLoader.readPositiveInt(
        file?.semantic?.timeoutMs,
        env.SOP_COMPACT_SEMANTIC_TIMEOUT_MS,
        12000
      ),
      hitlEnabled: RuntimeConfigLoader.readBoolean(file?.hitl?.enabled, env.HITL_ENABLED, false),
      hitlRetryLimit: RuntimeConfigLoader.readNonNegativeInt(file?.hitl?.retryLimit, env.HITL_RETRY_LIMIT, 2),
      hitlMaxInterventions: RuntimeConfigLoader.readNonNegativeInt(
        file?.hitl?.maxInterventions,
        env.HITL_MAX_INTERVENTIONS,
        1
      ),
      refinementEnabled: RuntimeConfigLoader.readBoolean(file?.refinement?.enabled, env.REFINEMENT_ENABLED, false),
      refinementMode: RuntimeConfigLoader.readRefinementMode(
        file?.refinement?.mode,
        env.REFINEMENT_MODE,
        "filtered_view"
      ),
      refinementMaxRounds: RuntimeConfigLoader.readPositiveInt(
        file?.refinement?.maxRounds,
        env.REFINEMENT_MAX_ROUNDS,
        12
      ),
      refinementTokenBudget: RuntimeConfigLoader.readPositiveInt(
        file?.refinement?.tokenBudget,
        env.REFINEMENT_TOKEN_BUDGET,
        1000
      ),
      refinementKnowledgeTopN: RuntimeConfigLoader.readPositiveInt(
        file?.refinement?.knowledgeTopN,
        env.REFINEMENT_KNOWLEDGE_TOP_N,
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
      return "openrouter/openrouter/auto";
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

  private static readBoolean(
    configValue: boolean | undefined,
    envValue: string | undefined,
    fallback: boolean
  ): boolean {
    if (typeof configValue === "boolean") {
      return configValue;
    }
    return RuntimeConfigLoader.parseBool(envValue, fallback);
  }

  private static readPositiveInt(
    configValue: number | undefined,
    envValue: string | undefined,
    fallback: number
  ): number {
    if (typeof configValue === "number" && Number.isFinite(configValue) && configValue > 0) {
      return Math.floor(configValue);
    }
    return RuntimeConfigLoader.parseInt(envValue, fallback);
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
    if (RuntimeConfigLoader.isThinkingLevel(configValue)) {
      return configValue;
    }
    if (RuntimeConfigLoader.isThinkingLevel(envValue)) {
      return envValue;
    }
    return fallback;
  }

  private static readSemanticMode(
    configValue: RuntimeSemanticMode | undefined,
    envValue: string | undefined,
    fallback: RuntimeSemanticMode
  ): RuntimeSemanticMode {
    if (RuntimeConfigLoader.isSemanticMode(configValue)) {
      return configValue;
    }
    if (RuntimeConfigLoader.isSemanticMode(envValue)) {
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

  private static readTelemetryTerminalMode(
    configValue: RuntimeTelemetryTerminalMode | undefined,
    envValue: string | undefined,
    fallback: RuntimeTelemetryTerminalMode
  ): RuntimeTelemetryTerminalMode {
    return RuntimeConfigLoader.readTelemetryEnum(
      "telemetry.terminal.mode",
      configValue,
      envValue,
      fallback,
      ["progress", "agent"]
    );
  }

  private static readTelemetryArtifactCheckpointMode(
    configValue: RuntimeTelemetryArtifactCheckpointMode | undefined,
    envValue: string | undefined,
    fallback: RuntimeTelemetryArtifactCheckpointMode
  ): RuntimeTelemetryArtifactCheckpointMode {
    return RuntimeConfigLoader.readTelemetryEnum(
      "telemetry.artifacts.checkpointMode",
      configValue,
      envValue,
      fallback,
      ["off", "key_turns", "all_turns"]
    );
  }

  private static readTelemetryEnum<T extends string>(
    label: string,
    configValue: T | undefined,
    envValue: string | undefined,
    fallback: T,
    allowed: readonly T[]
  ): T {
    if (configValue !== undefined) {
      return RuntimeConfigLoader.assertTelemetryEnum(label, configValue, allowed);
    }
    if (envValue !== undefined) {
      return RuntimeConfigLoader.assertTelemetryEnum(label, envValue as T, allowed);
    }
    return fallback;
  }

  private static assertTelemetryEnum<T extends string>(label: string, value: T, allowed: readonly T[]): T {
    const normalized = value.trim() as T;
    if (allowed.includes(normalized)) {
      return normalized;
    }
    throw new Error(`invalid ${label}: ${value}`);
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

  private static isThinkingLevel(value: string | undefined): value is RuntimeThinkingLevel {
    return value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
  }

  private static isSemanticMode(value: string | undefined): value is RuntimeSemanticMode {
    return value === "off" || value === "auto" || value === "on";
  }
}
