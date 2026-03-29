import type {
  CredentialCaptureResult,
  CredentialVerificationResult,
  ImportCookieFileInput,
  SiteAccountSummary,
  UpsertSiteAccountInput,
} from "../site-accounts";
import {
  desktopRunEventKinds,
  type CompactRunInput,
  type DesktopRunEvent,
  type DesktopRunSummary,
  type ObserveRunInput,
  type RefineRunInput,
} from "../runs";
import type { SopSkillSummary } from "../skills";

export type { DesktopRunEventKind } from "../runs";
export { desktopRunEventKinds } from "../runs";

const desktopApiContract = {
  accounts: ["list", "upsert", "launchEmbeddedLogin", "importCookieFile", "verifyCredential"],
  runs: [
    "startObserve",
    "startCompact",
    "startRefine",
    "interruptRun",
    "listRuns",
    "subscribe",
    "subscribeAll",
  ],
  artifacts: ["openRunArtifacts"],
  skills: ["list"],
} as const;

export interface SasikiDesktopApi {
  accounts: {
    list(): Promise<SiteAccountSummary[]>;
    upsert(input: UpsertSiteAccountInput): Promise<SiteAccountSummary>;
    launchEmbeddedLogin(input: { siteAccountId: string }): Promise<void>;
    importCookieFile(input: ImportCookieFileInput): Promise<CredentialCaptureResult>;
    verifyCredential(input: {
      siteAccountId: string;
    }): Promise<CredentialVerificationResult>;
  };
  runs: {
    startObserve(input: ObserveRunInput): Promise<{ runId: string }>;
    startCompact(input: CompactRunInput): Promise<{ runId: string }>;
    startRefine(input: RefineRunInput): Promise<{ runId: string }>;
    interruptRun(runId: string): Promise<{ interrupted: boolean }>;
    listRuns(): Promise<DesktopRunSummary[]>;
    subscribe(runId: string, callback: (event: DesktopRunEvent) => void): () => void;
    subscribeAll(callback: (event: DesktopRunEvent) => void): () => void;
  };
  artifacts: {
    openRunArtifacts(runId: string): Promise<void>;
  };
  skills: {
    list(): Promise<SopSkillSummary[]>;
  };
}

function createUnimplementedMethod<TMethod>(methodName: string): TMethod {
  return ((..._args: unknown[]) => {
    throw new Error(`${methodName} is not implemented`);
  }) as TMethod;
}

export function createDesktopApiShape(): SasikiDesktopApi {
  return {
    accounts: {
      list: createUnimplementedMethod<SasikiDesktopApi["accounts"]["list"]>("accounts.list"),
      upsert: createUnimplementedMethod<SasikiDesktopApi["accounts"]["upsert"]>("accounts.upsert"),
      launchEmbeddedLogin: createUnimplementedMethod<
        SasikiDesktopApi["accounts"]["launchEmbeddedLogin"]
      >("accounts.launchEmbeddedLogin"),
      importCookieFile: createUnimplementedMethod<
        SasikiDesktopApi["accounts"]["importCookieFile"]
      >("accounts.importCookieFile"),
      verifyCredential: createUnimplementedMethod<
        SasikiDesktopApi["accounts"]["verifyCredential"]
      >("accounts.verifyCredential"),
    },
    runs: {
      startObserve: createUnimplementedMethod<SasikiDesktopApi["runs"]["startObserve"]>(
        "runs.startObserve",
      ),
      startCompact: createUnimplementedMethod<SasikiDesktopApi["runs"]["startCompact"]>(
        "runs.startCompact",
      ),
      startRefine: createUnimplementedMethod<SasikiDesktopApi["runs"]["startRefine"]>(
        "runs.startRefine",
      ),
      interruptRun: createUnimplementedMethod<SasikiDesktopApi["runs"]["interruptRun"]>(
        "runs.interruptRun",
      ),
      listRuns: createUnimplementedMethod<SasikiDesktopApi["runs"]["listRuns"]>(
        "runs.listRuns",
      ),
      subscribe: createUnimplementedMethod<SasikiDesktopApi["runs"]["subscribe"]>(
        "runs.subscribe",
      ),
      subscribeAll: (() => () => undefined) as SasikiDesktopApi["runs"]["subscribeAll"],
    },
    artifacts: {
      openRunArtifacts: createUnimplementedMethod<
        SasikiDesktopApi["artifacts"]["openRunArtifacts"]
      >("artifacts.openRunArtifacts"),
    },
    skills: {
      list: createUnimplementedMethod<SasikiDesktopApi["skills"]["list"]>("skills.list"),
    },
  };
}

type ContractSectionName = keyof typeof desktopApiContract;

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertMethodSection(
  api: Record<string, unknown>,
  section: ContractSectionName,
): void {
  assertObject(api[section], `desktop api.${section}`);
  const methods = desktopApiContract[section];
  for (const methodName of methods) {
    if (typeof api[section][methodName] !== "function") {
      throw new Error(`desktop api.${section}.${methodName} must be a function`);
    }
  }
}

export function assertDesktopApiContract(api: unknown): asserts api is SasikiDesktopApi {
  assertObject(api, "desktop api");
  assertMethodSection(api, "accounts");
  assertMethodSection(api, "runs");
  assertMethodSection(api, "artifacts");
  assertMethodSection(api, "skills");
}
