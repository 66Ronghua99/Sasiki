import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface RuntimeConfigFile {
  llm?: {
    model?: string;
    apiKey?: string;
    baseUrl?: string;
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
    headless?: boolean;
    injectCookies?: boolean;
    cookiesDir?: string;
    preferSystemBrowser?: boolean;
    executablePath?: string;
    startupTimeoutMs?: number;
  };
  runtime?: {
    artifactsDir?: string;
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
  cdpHeadless: boolean;
  cdpInjectCookies: boolean;
  cdpCookiesDir: string;
  cdpPreferSystemBrowser: boolean;
  cdpExecutablePath?: string;
  cdpStartupTimeoutMs: number;
  model: string;
  apiKey: string;
  baseUrl?: string;
  artifactsDir: string;
}

export interface RuntimeConfigSourceOptions {
  configPath?: string;
}

export class RuntimeConfigLoader {
  static fromSources(options?: RuntimeConfigSourceOptions): RuntimeConfig {
    const loaded = this.loadConfigFile(options?.configPath);
    const file = loaded?.config;
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
      artifactsDir: file?.runtime?.artifactsDir ?? process.env.RUNTIME_ARTIFACTS_DIR ?? "artifacts/e2e",
    };
  }

  private static defaultModel(
    domesticApiKey: string | undefined,
    openRouterApiKey: string | undefined,
    baseUrl?: string
  ): string {
    const normalizedBaseUrl = baseUrl?.trim().toLowerCase() ?? "";
    if (normalizedBaseUrl.includes("dashscope.aliyuncs.com")) {
      return "MiniMax-M2.5";
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
