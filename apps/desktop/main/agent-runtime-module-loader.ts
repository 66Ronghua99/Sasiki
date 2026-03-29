import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function resolveAgentRuntimeDistRoot(moduleDir: string): string {
  let currentDir = moduleDir;

  while (true) {
    if (existsSync(resolve(currentDir, "apps/agent-runtime/package.json"))) {
      return resolve(currentDir, "apps/agent-runtime/dist");
    }

    const parentDir = resolve(currentDir, "..");
    if (parentDir === currentDir) {
      throw new Error(`Unable to resolve agent runtime dist root from ${moduleDir}`);
    }

    currentDir = parentDir;
  }
}

export async function loadAgentRuntimeModule<T>(
  distRoot: string,
  modulePath: string,
): Promise<T> {
  const moduleUrl = pathToFileURL(resolve(distRoot, modulePath)).href;
  return import(moduleUrl) as Promise<T>;
}
