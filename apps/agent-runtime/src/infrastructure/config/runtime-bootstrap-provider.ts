/**
 * Deps: node:fs, node:path, contracts/runtime-config.ts
 * Used By: application/shell/runtime-config-bootstrap.ts, tests
 * Last Updated: 2026-03-23
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RuntimeBootstrapSources, RuntimeConfigFile } from "../../contracts/runtime-config.js";

export interface RuntimeBootstrapProviderOptions {
  configPath?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export class RuntimeBootstrapProvider {
  private readonly configPath?: string;
  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options?: RuntimeBootstrapProviderOptions) {
    this.configPath = options?.configPath;
    this.cwd = options?.cwd ? path.resolve(options.cwd) : process.cwd();
    this.env = options?.env ?? process.env;
  }

  load(): RuntimeBootstrapSources {
    const loaded = this.loadConfigFile(this.configPath);
    return {
      configPath: loaded?.path,
      projectRoot: this.resolveProjectRoot(loaded?.path ? path.dirname(loaded.path) : this.cwd),
      file: loaded?.config,
      env: this.env,
    };
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

export function loadRuntimeBootstrapSources(options?: RuntimeBootstrapProviderOptions): RuntimeBootstrapSources {
  return new RuntimeBootstrapProvider(options).load();
}
