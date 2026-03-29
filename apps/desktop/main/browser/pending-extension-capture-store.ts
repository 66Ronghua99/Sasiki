import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { CredentialCookieRecord } from "../accounts/credential-bundle-store";
import { readJsonFile, writeJsonFile } from "../accounts/json-file-store";

export interface PendingExtensionCaptureRecord {
  pendingCaptureId: string;
  site: string;
  cookies: CredentialCookieRecord[];
  capturedAt: string;
  accountId: string | null;
}

interface PendingExtensionCaptureStoreData {
  captures: PendingExtensionCaptureRecord[];
}

export interface PendingExtensionCaptureStoreOptions {
  rootDir: string;
}

export interface SavePendingExtensionCaptureInput {
  site: string;
  cookies: CredentialCookieRecord[];
  capturedAt: string;
  accountId: string | null;
}

export class PendingExtensionCaptureStore {
  private readonly filePath: string;

  constructor(options: PendingExtensionCaptureStoreOptions) {
    this.filePath = join(options.rootDir, "cookies", "pending-extension-captures.json");
  }

  private async readData(): Promise<PendingExtensionCaptureStoreData> {
    return readJsonFile(this.filePath, () => ({ captures: [] }));
  }

  private async writeData(data: PendingExtensionCaptureStoreData): Promise<void> {
    await writeJsonFile(this.filePath, data);
  }

  async save(input: SavePendingExtensionCaptureInput): Promise<PendingExtensionCaptureRecord> {
    const data = await this.readData();
    const record: PendingExtensionCaptureRecord = {
      pendingCaptureId: `pending-capture-${randomUUID()}`,
      site: input.site,
      cookies: input.cookies.map((cookie) => ({ ...cookie })),
      capturedAt: input.capturedAt,
      accountId: input.accountId,
    };

    data.captures.push(record);
    await this.writeData(data);
    return { ...record, cookies: record.cookies.map((cookie) => ({ ...cookie })) };
  }

  async list(): Promise<PendingExtensionCaptureRecord[]> {
    const data = await this.readData();
    return data.captures.map((record) => ({
      ...record,
      cookies: record.cookies.map((cookie) => ({ ...cookie })),
    }));
  }
}
