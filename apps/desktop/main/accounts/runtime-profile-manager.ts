import { mkdir } from "node:fs/promises";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { assertNonEmptyString, readJsonFile, writeJsonFile } from "./json-file-store";
import type { SiteAccountStore } from "./site-account-store";

export interface RuntimeProfileLease {
  siteAccountId: string;
  runtimeProfileId: string;
  profilePath: string;
  isolated: boolean;
}

interface RuntimeProfileManagerData {
  defaultProfiles: Record<string, string>;
}

export interface RuntimeProfileManagerOptions {
  rootDir: string;
  siteAccountStore: SiteAccountStore;
}

export interface RuntimeProfileAllocationInput {
  siteAccountId: string;
  allowParallel: boolean;
}

export class RuntimeProfileManager {
  private readonly rootDir: string;
  private readonly filePath: string;
  private readonly siteAccountStore: SiteAccountStore;

  public constructor(options: RuntimeProfileManagerOptions) {
    this.rootDir = options.rootDir;
    this.siteAccountStore = options.siteAccountStore;
    this.filePath = join(options.rootDir, "profiles", "runtime-profile-manager.json");
  }

  private async readData(): Promise<RuntimeProfileManagerData> {
    return readJsonFile(this.filePath, () => ({ defaultProfiles: {} }));
  }

  private async writeData(data: RuntimeProfileManagerData): Promise<void> {
    await writeJsonFile(this.filePath, data);
  }

  private createProfilePath(runtimeProfileId: string): string {
    return join(this.rootDir, "profiles", runtimeProfileId);
  }

  public async allocate(input: RuntimeProfileAllocationInput): Promise<RuntimeProfileLease> {
    const siteAccountId = assertNonEmptyString(input.siteAccountId, "siteAccountId");
    const siteAccount = await this.siteAccountStore.getById(siteAccountId);

    if (!siteAccount) {
      throw new Error(`Unknown site account: ${siteAccountId}`);
    }

    if (input.allowParallel) {
      const isolatedProfileId = `runtime-profile-${siteAccountId}-${randomUUID()}`;
      await mkdir(this.createProfilePath(isolatedProfileId), { recursive: true });
      return {
        siteAccountId,
        runtimeProfileId: isolatedProfileId,
        profilePath: this.createProfilePath(isolatedProfileId),
        isolated: true,
      };
    }

    const data = await this.readData();
    const runtimeProfileId =
      data.defaultProfiles[siteAccountId] ?? `runtime-profile-${siteAccountId}`;

    data.defaultProfiles[siteAccountId] = runtimeProfileId;
    await this.writeData(data);
    await this.siteAccountStore.setDefaultRuntimeProfileId(siteAccountId, runtimeProfileId);
    await mkdir(this.createProfilePath(runtimeProfileId), { recursive: true });

    return {
      siteAccountId,
      runtimeProfileId,
      profilePath: this.createProfilePath(runtimeProfileId),
      isolated: false,
    };
  }

  public async release(lease: RuntimeProfileLease): Promise<void> {
    if (!lease.isolated) {
      return;
    }

    await rm(lease.profilePath, { recursive: true, force: true });
  }
}
