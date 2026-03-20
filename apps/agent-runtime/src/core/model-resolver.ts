/**
 * Deps: @mariozechner/pi-ai
 * Used By: core/agent-loop.ts
 * Last Updated: 2026-03-04
 */
import { getModel, getModels, getProviders, type KnownProvider, type Model } from "@mariozechner/pi-ai";

export interface ModelResolverConfig {
  model: string;
  baseUrl?: string;
}

export class ModelResolver {
  static resolve(config: ModelResolverConfig): Model<any> {
    if (config.baseUrl && this.isOpenRouterBaseUrl(config.baseUrl)) {
      const modelToken = this.normalizeOpenRouterModelToken(config.model);
      const resolved = this.resolveModel("openrouter", modelToken);
      if (resolved) {
        return config.baseUrl ? { ...resolved, baseUrl: config.baseUrl } : resolved;
      }
      return this.createCustomModel("openrouter", modelToken, config.baseUrl);
    }

    const parsed = this.parseModel(config.model);
    if (config.baseUrl && parsed.provider === "openai") {
      if (this.isOfficialOpenAiBaseUrl(config.baseUrl)) {
        const direct = this.tryGetModel("openai", parsed.model);
        if (direct) {
          return { ...direct, baseUrl: config.baseUrl };
        }
      }
      return this.createCustomModel("openai", parsed.model, config.baseUrl);
    }

    const resolved =
      this.resolveModel(parsed.provider, parsed.model) ??
      (config.baseUrl ? undefined : this.resolveProviderAlias(parsed));
    if (resolved) {
      if (!config.baseUrl) {
        return resolved;
      }
      return { ...resolved, baseUrl: config.baseUrl };
    }

    if (config.baseUrl) {
      return this.createCustomModel(parsed.provider, parsed.model, config.baseUrl);
    }

    this.throwUnknownModel(parsed.provider, parsed.model);
  }

  private static resolveModel(provider: string, modelToken: string): Model<any> | undefined {
    const direct = this.tryGetModel(provider, modelToken);
    if (direct) {
      return direct;
    }

    const candidates = getModels(provider as KnownProvider);
    if (candidates.length === 0) {
      return undefined;
    }
    const normalizedToken = this.normalize(modelToken);
    const normalizedProvider = this.normalize(provider);
    return candidates.find((candidate) => {
      const id = this.normalize(candidate.id);
      const name = this.normalize(candidate.name);
      const candidateProvider = this.normalize(String(candidate.provider ?? ""));
      return (
        (candidateProvider === normalizedProvider && id === normalizedToken) ||
        (candidateProvider === normalizedProvider && name === normalizedToken) ||
        (candidateProvider === normalizedProvider && id.endsWith(normalizedToken)) ||
        (candidateProvider === normalizedProvider && name.endsWith(normalizedToken))
      );
    });
  }

  private static tryGetModel(provider: string, modelToken: string): Model<any> | undefined {
    try {
      return getModel(provider as KnownProvider, modelToken as never);
    } catch {
      return undefined;
    }
  }

  private static resolveProviderAlias(parsed: { provider: string; model: string }): Model<any> | undefined {
    if (parsed.provider !== "openai") {
      return undefined;
    }
    if (!/^minimax/i.test(parsed.model)) {
      return undefined;
    }

    const canonical = parsed.model.replace(/^MiniMaxAI\//i, "");
    return this.resolveModel("minimax", canonical) ?? this.resolveModel("minimax-cn", canonical);
  }

  private static createCustomModel(provider: string, modelToken: string, baseUrl: string): Model<any> {
    const template = this.templateForProvider(provider);
    const api = provider === "openai" ? this.resolveOpenAiApi(baseUrl, template.api) : template.api;
    const compat = provider === "openai" ? this.resolveOpenAiCompat(baseUrl, modelToken, api) : template.compat;
    return {
      ...template,
      id: modelToken,
      name: modelToken,
      api,
      provider,
      baseUrl,
      ...(compat ? { compat } : {}),
    };
  }

  private static resolveOpenAiApi(baseUrl: string, fallbackApi: string): string {
    const normalized = baseUrl.trim().toLowerCase();
    if (this.isOfficialOpenAiBaseUrl(normalized)) {
      return fallbackApi;
    }
    return "openai-completions";
  }

  private static isOfficialOpenAiBaseUrl(baseUrl: string): boolean {
    return baseUrl.trim().toLowerCase().includes("api.openai.com");
  }

  private static isOpenRouterBaseUrl(baseUrl: string): boolean {
    return baseUrl.trim().toLowerCase().includes("openrouter.ai");
  }

  private static normalizeOpenRouterModelToken(model: string): string {
    const value = model.trim();
    if (!value) {
      return "openrouter/auto";
    }
    if (/^openrouter\//i.test(value)) {
      return value.replace(/^openrouter\//i, "");
    }
    return value;
  }

  private static resolveOpenAiCompat(
    baseUrl: string,
    modelToken: string,
    api: string
  ): Record<string, unknown> | undefined {
    if (api !== "openai-completions") {
      return undefined;
    }
    const normalized = baseUrl.trim().toLowerCase();
    if (this.isOfficialOpenAiBaseUrl(normalized)) {
      return undefined;
    }

    const compat: Record<string, unknown> = {
      supportsDeveloperRole: false,
      supportsStore: false,
      supportsReasoningEffort: false,
    };
    if (normalized.includes("dashscope.aliyuncs.com")) {
      compat.maxTokensField = "max_tokens";
      compat.supportsStrictMode = false;
      if (modelToken.trim().toLowerCase().includes("qwen")) {
        compat.thinkingFormat = "qwen";
      }
    }
    return compat;
  }

  private static templateForProvider(provider: string): Model<any> {
    const models = getModels(provider as KnownProvider);
    if (models.length > 0) {
      return models[0];
    }
    const fallback = this.tryGetModel("openai", "gpt-4o-mini");
    if (fallback) {
      return fallback;
    }
    const openaiModels = getModels("openai");
    if (openaiModels.length > 0) {
      return openaiModels[0];
    }
    throw new Error("No model templates found for custom model resolution");
  }

  private static throwUnknownModel(provider: string, modelToken: string): never {
    const candidates = getModels(provider as KnownProvider);
    if (candidates.length > 0) {
      const sample = candidates
        .slice(0, 8)
        .map((item) => item.id)
        .join(", ");
      throw new Error(
        `Unknown model '${provider}/${modelToken}'. Known examples for provider '${provider}': ${sample}`
      );
    }

    const providers = getProviders().slice(0, 12).join(", ");
    throw new Error(
      `Unknown provider '${provider}' for model '${modelToken}'. Known providers include: ${providers}`
    );
  }

  private static parseModel(model: string): { provider: string; model: string } {
    const value = model.trim();
    if (!value) {
      return { provider: "openai", model: "gpt-4o-mini" };
    }
    const slash = value.indexOf("/");
    if (slash > 0) {
      return { provider: value.slice(0, slash), model: value.slice(slash + 1) };
    }
    const colon = value.indexOf(":");
    if (colon > 0) {
      return { provider: value.slice(0, colon), model: value.slice(colon + 1) };
    }
    return { provider: "openai", model: value };
  }

  private static normalize(value: string): string {
    return value.trim().toLowerCase().replace(/[\s_.-]/g, "");
  }
}
