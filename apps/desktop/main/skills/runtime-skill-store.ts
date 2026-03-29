import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAgentRuntimeModule, resolveAgentRuntimeDistRoot } from "../agent-runtime-module-loader";

export interface RuntimeSkillMetadata {
  name: string;
  description: string;
}

export interface RuntimeSkillStoreLike {
  listMetadata(): Promise<RuntimeSkillMetadata[]>;
}

export interface RuntimeSkillStoreModule {
  SopSkillStore: new (rootDir?: string) => RuntimeSkillStoreLike;
}

export interface RuntimeLoadedSkillStoreOptions {
  rootDir: string;
  loadCanonicalSkillStoreModule?: () => Promise<RuntimeSkillStoreModule>;
}

export function createRuntimeLoadedSkillStore(
  options: RuntimeLoadedSkillStoreOptions,
): RuntimeSkillStoreLike {
  const loadCanonicalSkillStoreModule = options.loadCanonicalSkillStoreModule ?? loadCanonicalSkillStoreModuleFromDist;
  let storePromise: Promise<RuntimeSkillStoreLike> | undefined;

  async function getStore(): Promise<RuntimeSkillStoreLike> {
    if (!storePromise) {
      storePromise = loadCanonicalSkillStoreModule().then((module) => new module.SopSkillStore(options.rootDir));
    }
    return storePromise;
  }

  return {
    async listMetadata() {
      return (await getStore()).listMetadata();
    },
  };
}

async function loadCanonicalSkillStoreModuleFromDist(): Promise<RuntimeSkillStoreModule> {
  const distRoot = resolveAgentRuntimeDistRoot(dirname(fileURLToPath(import.meta.url)));
  return loadAgentRuntimeModule<RuntimeSkillStoreModule>(
    distRoot,
    "infrastructure/persistence/sop-skill-store.js",
  );
}
