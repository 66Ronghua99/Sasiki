import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  return importAgentRuntimeModule<RuntimeSkillStoreModule>("infrastructure/persistence/sop-skill-store.js");
}

async function importAgentRuntimeModule<T>(modulePath: string): Promise<T> {
  const distRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../agent-runtime/dist");
  const moduleUrl = pathToFileURL(join(distRoot, modulePath)).href;
  const dynamicImport = new Function("specifier", "return import(specifier);") as (
    specifier: string,
  ) => Promise<T>;
  return dynamicImport(moduleUrl);
}
