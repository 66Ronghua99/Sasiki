/**
 * Deps: node:fs, node:path
 * Used By: runtime/runtime-config.ts
 * Last Updated: 2026-03-21
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type RuntimeThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type RuntimeSemanticMode = "off" | "auto" | "on";

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

export interface RuntimeBootstrapProviderOptions extends RuntimeConfigSourceOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_SOP_ASSET_ROOT_DIR = "~/.sasiki/sop_assets";
const DEFAULT_ARTIFACTS_SUBDIR = path.join("artifacts", "e2e");

export class RuntimeBootstrapProvider {
  private readonly configPath?: string;
  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options?: RuntimeBootstrapProviderOptions) {
    this.configPath = options?.configPath;
    this.cwd = options?.cwd ? path.resolve(options.cwd) : process.cwd();
    this.env = options?.env ?? process.env;
  }

  load(): RuntimeConfig {
    const loaded = this.loadConfigFile(this.configPath);
    const file = loaded?.config;
    const projectRoot = this.resolveProjectRoot(loaded?.path ? path.dirname(loaded.path) : this.cwd);
    const domesticApiKey = this.env.LLM_API_KEY ?? this.env.DASHSCOPE_API_KEY;
    const openRouterApiKey = this.env.OPENROUTER_API_KEY;
    const baseUrl = file?.llm?.baseUrl ?? this.env.LLM_BASE_URL ?? this.env.DASHSCOPE_BASE_URL;
    const apiKey = file?.llm?.apiKey ?? domesticApiKey ?? openRouterApiKey ?? "";
    const model =
      file?.llm?.model ??
      this.env.LLM_MODEL ??
      this.defaultModel(domesticApiKey, openRouterApiKey, baseUrl);

    return {
      configPath: loaded?.path,
      mcpCommand: file?.mcp?.command ?? this.env.MCP_COMMAND ?? "npx",
      mcpArgs: this.parseArgs(file?.mcp?.args, this.env.MCP_ARGS ?? "@playwright/mcp@latest"),
      mcpEnv: file?.mcp?.env ?? {},
      cdpEndpoint: file?.cdp?.endpoint ?? this.env.PLAYWRIGHT_MCP_CDP_ENDPOINT ?? "http://localhost:9222",
      launchCdp: this.readBoolean(file?.cdp?.launch, this.env.LAUNCH_CDP, true),
      cdpUserDataDir: file?.cdp?.userDataDir ?? this.env.CDP_USER_DATA_DIR ?? "~/.sasiki/chrome_profile",
      cdpResetPagesOnLaunch: this.readBoolean(
        file?.cdp?.resetPagesOnLaunch,
        this.env.CDP_RESET_PAGES_ON_LAUNCH,
        true
      ),
      cdpHeadless: this.readBoolean(file?.cdp?.headless, this.env.CDP_HEADLESS, false),
      cdpInjectCookies: this.readBoolean(file?.cdp?.injectCookies, this.env.INJECT_COOKIES, true),
      cdpCookiesDir: file?.cdp?.cookiesDir ?? this.env.COOKIES_DIR ?? "~/.sasiki/cookies",
      cdpPreferSystemBrowser: this.readBoolean(file?.cdp?.preferSystemBrowser, this.env.PREFER_SYSTEM_BROWSER, true),
      cdpExecutablePath: file?.cdp?.executablePath ?? this.env.CHROME_EXECUTABLE_PATH,
      cdpStartupTimeoutMs: this.readPositiveInt(
        file?.cdp?.startupTimeoutMs,
        this.env.CDP_STARTUP_TIMEOUT_MS,
        30000
      ),
      model,
      apiKey,
      baseUrl,
      thinkingLevel: this.readThinkingLevel(file?.llm?.thinkingLevel, this.env.LLM_THINKING_LEVEL, "minimal"),
      artifactsDir: this.resolveArtifactsDir(projectRoot, file?.runtime?.artifactsDir, this.env.RUNTIME_ARTIFACTS_DIR),
      runSystemPrompt: this.readOptionalString(file?.runtime?.runSystemPrompt, this.env.RUNTIME_RUN_SYSTEM_PROMPT),
      refineSystemPrompt: this.readOptionalString(
        file?.runtime?.refineSystemPrompt,
        this.env.RUNTIME_REFINE_SYSTEM_PROMPT
      ),
      observeTimeoutMs: this.readPositiveInt(file?.observe?.timeoutMs, this.env.OBSERVE_TIMEOUT_MS, 120000),
      sopAssetRootDir: DEFAULT_SOP_ASSET_ROOT_DIR,
      semanticMode: this.readSemanticMode(file?.semantic?.mode, this.env.SOP_COMPACT_SEMANTIC_MODE, "auto"),
      semanticTimeoutMs: this.readPositiveInt(
        file?.semantic?.timeoutMs,
        this.env.SOP_COMPACT_SEMANTIC_TIMEOUT_MS,
        12000
      ),
      hitlEnabled: this.readBoolean(file?.hitl?.enabled, this.env.HITL_ENABLED, false),
      hitlRetryLimit: this.readNonNegativeInt(file?.hitl?.retryLimit, this.env.HITL_RETRY_LIMIT, 2),
      hitlMaxInterventions: this.readNonNegativeInt(
        file?.hitl?.maxInterventions,
        this.env.HITL_MAX_INTERVENTIONS,
        1
      ),
      refinementEnabled: this.readBoolean(file?.refinement?.enabled, this.env.REFINEMENT_ENABLED, false),
      refinementMode: this.readRefinementMode(
        file?.refinement?.mode,
        this.env.REFINEMENT_MODE,
        "filtered_view"
      ),
      refinementMaxRounds: this.readPositiveInt(file?.refinement?.maxRounds, this.env.REFINEMENT_MAX_ROUNDS, 12),
      refinementTokenBudget: this.readPositiveInt(
        file?.refinement?.tokenBudget,
        this.env.REFINEMENT_TOKEN_BUDGET,
        1000
      ),
      refinementKnowledgeTopN: this.readPositiveInt(
        file?.refinement?.knowledgeTopN,
        this.env.REFINEMENT_KNOWLEDGE_TOP_N,
        8
      ),
    };
  }

  private defaultModel(
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

  private parseBool(value: string | undefined, fallback: boolean): boolean {
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

  private parseInt(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private parseArgs(value: string[] | string | undefined, fallback: string): string[] {
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof value === "string") {
      return value.split(" ").filter(Boolean);
    }
    return fallback.split(" ").filter(Boolean);
  }

  private readOptionalString(configValue: string | undefined, envValue: string | undefined): string | undefined {
    const value = typeof configValue === "string" && configValue.trim() ? configValue : envValue;
    if (!value || !value.trim()) {
      return undefined;
    }
    return value.trim();
  }

  private readBoolean(configValue: boolean | undefined, envValue: string | undefined, fallback: boolean): boolean {
    if (typeof configValue === "boolean") {
      return configValue;
    }
    return this.parseBool(envValue, fallback);
  }

  private readPositiveInt(
    configValue: number | undefined,
    envValue: string | undefined,
    fallback: number
  ): number {
    if (typeof configValue === "number" && Number.isFinite(configValue) && configValue > 0) {
      return Math.floor(configValue);
    }
    return this.parseInt(envValue, fallback);
  }

  private readNonNegativeInt(
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

  private readThinkingLevel(
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

  private readSemanticMode(
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

  private readRefinementMode(
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

  private resolveArtifactsDir(root: string, configValue: string | undefined, envValue: string | undefined): string {
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

  private resolveProjectRoot(startDir: string): string {
    let current = path.resolve(startDir);
    while (true) {
      if (existsSync(path.join(current, ".git"))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return path.resolve(this.cwd);
      }
      current = parent;
    }
  }

  private isThinkingLevel(value: string | undefined): value is RuntimeThinkingLevel {
    return value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
  }

  private isSemanticMode(value: string | undefined): value is RuntimeSemanticMode {
    return value === "off" || value === "auto" || value === "on";
  }

  private loadConfigFile(
    explicitPath?: string
  ): { path: string; config: RuntimeConfigFile } | undefined {
    const candidates = this.configCandidates(explicitPath);
    for (const candidate of candidates) {
      const absolute = this.resolveCandidatePath(candidate);
      if (!existsSync(absolute)) {
        continue;
      }
      const raw = readFileSync(absolute, "utf-8");
      const parsed = JSON.parse(raw) as RuntimeConfigFile;
      return { path: absolute, config: parsed };
    }
    if (explicitPath) {
      throw new Error(`runtime config file not found: ${this.resolveCandidatePath(explicitPath)}`);
    }
    return undefined;
  }

  private configCandidates(explicitPath?: string): string[] {
    const paths: string[] = [];
    if (explicitPath?.trim()) {
      paths.push(explicitPath.trim());
    }
    const fromEnv = this.env.RUNTIME_CONFIG_PATH;
    if (fromEnv?.trim()) {
      paths.push(fromEnv.trim());
    }
    paths.push(path.resolve(this.cwd, "runtime.config.json"));
    paths.push(path.resolve(this.cwd, "apps/agent-runtime/runtime.config.json"));
    return paths;
  }

  private resolveCandidatePath(candidate: string): string {
    return path.isAbsolute(candidate) ? candidate : path.resolve(this.cwd, candidate);
  }
}
