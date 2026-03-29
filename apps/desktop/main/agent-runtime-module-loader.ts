import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function resolveAgentRuntimeDistRoot(moduleDir: string): string {
  return resolve(moduleDir, "../../../agent-runtime/dist");
}

export async function loadAgentRuntimeModule<T>(
  distRoot: string,
  modulePath: string,
): Promise<T> {
  const moduleUrl = pathToFileURL(resolve(distRoot, modulePath)).href;
  return import(moduleUrl) as Promise<T>;
}
