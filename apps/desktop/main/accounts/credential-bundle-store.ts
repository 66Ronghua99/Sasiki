import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  CredentialBundleSource,
  CredentialCaptureResult,
} from "../../shared/site-accounts";
import { assertNonEmptyString, readJsonFile, writeJsonFile } from "./json-file-store";
import type { SiteAccountStore } from "./site-account-store";

export interface CredentialCookieRecord {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface CredentialBundleRecord {
  credentialBundleId: string;
  siteAccountId: string;
  credentialSource: CredentialBundleSource;
  cookies: CredentialCookieRecord[];
  capturedAt: string;
  provenance: string | null;
  active: boolean;
}

interface CredentialBundleStoreData {
  bundles: CredentialBundleRecord[];
}

export interface CredentialBundleStoreOptions {
  rootDir: string;
  siteAccountStore?: SiteAccountStore;
}

export interface SaveCredentialBundleInput {
  siteAccountId: string;
  source: CredentialBundleSource;
  cookies: CredentialCookieRecord[];
  capturedAt: string;
  provenance: string | null;
}

export class CredentialBundleStore {
  private readonly filePath: string;

  public constructor(private readonly options: CredentialBundleStoreOptions) {
    this.filePath = join(options.rootDir, "cookies", "credential-bundles.json");
  }

  private async readData(): Promise<CredentialBundleStoreData> {
    return readJsonFile(this.filePath, () => ({ bundles: [] }));
  }

  private async writeData(data: CredentialBundleStoreData): Promise<void> {
    await writeJsonFile(this.filePath, data);
  }

  public async save(input: SaveCredentialBundleInput): Promise<CredentialCaptureResult> {
    const siteAccountId = assertNonEmptyString(input.siteAccountId, "siteAccountId");
    const capturedAt = assertNonEmptyString(input.capturedAt, "capturedAt");
    const data = await this.readData();
    const nextBundleId = `credential-bundle-${randomUUID()}`;

    for (const bundle of data.bundles) {
      if (bundle.siteAccountId === siteAccountId) {
        bundle.active = false;
      }
    }

    data.bundles.push({
      credentialBundleId: nextBundleId,
      siteAccountId,
      credentialSource: input.source,
      cookies: input.cookies.map((cookie) => ({ ...cookie })),
      capturedAt,
      provenance: input.provenance,
      active: true,
    });

    await this.writeData(data);

    if (this.options.siteAccountStore) {
      await this.options.siteAccountStore.setActiveCredential({
        siteAccountId,
        credentialBundleId: nextBundleId,
        credentialSource: input.source,
        credentialUpdatedAt: capturedAt,
      });
    }

    return {
      siteAccountId,
      credentialBundleId: nextBundleId,
      credentialSource: input.source,
      capturedAt,
      provenance: input.provenance,
    };
  }

  public async getActiveForAccount(
    siteAccountId: string,
  ): Promise<CredentialBundleRecord | null> {
    const data = await this.readData();
    const active = data.bundles.find(
      (bundle) => bundle.siteAccountId === siteAccountId && bundle.active,
    );
    return active ? { ...active, cookies: active.cookies.map((cookie) => ({ ...cookie })) } : null;
  }
}
