import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  CredentialBundleSource,
  CredentialVerificationStatus,
  SiteAccountSummary,
  UpsertSiteAccountInput,
} from "../../shared/site-accounts";
import { assertNonEmptyString, readJsonFile, writeJsonFile } from "./json-file-store";

interface SiteAccountStoreData {
  accounts: SiteAccountSummary[];
}

export interface SiteAccountStoreOptions {
  rootDir: string;
}

export interface SetActiveCredentialInput {
  siteAccountId: string;
  credentialBundleId: string;
  credentialSource: CredentialBundleSource;
  credentialUpdatedAt: string;
}

export interface SetVerificationStatusInput {
  siteAccountId: string;
  status: CredentialVerificationStatus;
  checkedAt: string;
}

export class SiteAccountStore {
  private readonly filePath: string;

  public constructor(options: SiteAccountStoreOptions) {
    this.filePath = join(options.rootDir, "accounts", "site-accounts.json");
  }

  private async readData(): Promise<SiteAccountStoreData> {
    return readJsonFile(this.filePath, () => ({ accounts: [] }));
  }

  private async writeData(data: SiteAccountStoreData): Promise<void> {
    await writeJsonFile(this.filePath, data);
  }

  private static createAccountSummary(input: UpsertSiteAccountInput): SiteAccountSummary {
    return {
      id: input.id ?? `site-account-${randomUUID()}`,
      site: assertNonEmptyString(input.site, "site"),
      label: assertNonEmptyString(input.label, "label"),
      activeCredentialId: null,
      activeCredentialSource: null,
      credentialUpdatedAt: null,
      verificationStatus: "unknown",
      lastVerifiedAt: null,
      defaultRuntimeProfileId: null,
    };
  }

  public async list(): Promise<SiteAccountSummary[]> {
    const data = await this.readData();
    return data.accounts.map((account) => ({ ...account }));
  }

  public async getById(siteAccountId: string): Promise<SiteAccountSummary | null> {
    const data = await this.readData();
    const account = data.accounts.find((candidate) => candidate.id === siteAccountId);
    return account ? { ...account } : null;
  }

  public async upsert(input: UpsertSiteAccountInput): Promise<SiteAccountSummary> {
    const data = await this.readData();
    const existingIndex = data.accounts.findIndex((account) => account.id === input.id);
    const existing = existingIndex >= 0 ? data.accounts[existingIndex] : null;

    const summary = existing
      ? {
          ...existing,
          site: assertNonEmptyString(input.site, "site"),
          label: assertNonEmptyString(input.label, "label"),
        }
      : SiteAccountStore.createAccountSummary(input);

    if (existingIndex >= 0) {
      data.accounts[existingIndex] = summary;
    } else {
      data.accounts.push(summary);
    }

    await this.writeData(data);
    return { ...summary };
  }

  public async setActiveCredential(input: SetActiveCredentialInput): Promise<SiteAccountSummary> {
    const data = await this.readData();
    const account = data.accounts.find((candidate) => candidate.id === input.siteAccountId);

    if (!account) {
      throw new Error(`Unknown site account: ${input.siteAccountId}`);
    }

    account.activeCredentialId = input.credentialBundleId;
    account.activeCredentialSource = input.credentialSource;
    account.credentialUpdatedAt = input.credentialUpdatedAt;
    await this.writeData(data);
    return { ...account };
  }

  public async setVerificationStatus(
    input: SetVerificationStatusInput,
  ): Promise<SiteAccountSummary> {
    const data = await this.readData();
    const account = data.accounts.find((candidate) => candidate.id === input.siteAccountId);

    if (!account) {
      throw new Error(`Unknown site account: ${input.siteAccountId}`);
    }

    account.verificationStatus = input.status;
    account.lastVerifiedAt = input.checkedAt;
    await this.writeData(data);
    return { ...account };
  }

  public async setDefaultRuntimeProfileId(
    siteAccountId: string,
    defaultRuntimeProfileId: string,
  ): Promise<SiteAccountSummary> {
    const data = await this.readData();
    const account = data.accounts.find((candidate) => candidate.id === siteAccountId);

    if (!account) {
      throw new Error(`Unknown site account: ${siteAccountId}`);
    }

    account.defaultRuntimeProfileId = assertNonEmptyString(
      defaultRuntimeProfileId,
      "defaultRuntimeProfileId",
    );
    await this.writeData(data);
    return { ...account };
  }
}
