import { readFile } from "node:fs/promises";
import type { CredentialCookieRecord, CredentialBundleStore } from "./credential-bundle-store";

export interface CookieImportServiceOptions {
  credentialStore: CredentialBundleStore;
}

interface ImportedCookieFile {
  cookies?: CredentialCookieRecord[];
}

function parseImportedCookies(content: string, filePath: string): CredentialCookieRecord[] {
  let parsed: ImportedCookieFile | CredentialCookieRecord[] | null;

  try {
    parsed = JSON.parse(content) as ImportedCookieFile | CredentialCookieRecord[];
  } catch (error) {
    throw new Error(`Invalid cookie file ${filePath}: ${(error as Error).message}`);
  }

  if (Array.isArray(parsed)) {
    return parsed.map((cookie) => ({ ...cookie }));
  }

  if (parsed && Array.isArray(parsed.cookies)) {
    return parsed.cookies.map((cookie) => ({ ...cookie }));
  }

  throw new Error(`Cookie file ${filePath} must contain a cookies array`);
}

export class CookieImportService {
  public constructor(private readonly options: CookieImportServiceOptions) {}

  public async importFromFile(input: {
    siteAccountId: string;
    filePath?: string;
  }) {
    if (!input.filePath) {
      throw new Error("filePath is required");
    }

    const content = await readFile(input.filePath, "utf8");
    const cookies = parseImportedCookies(content, input.filePath);

    return this.options.credentialStore.save({
      siteAccountId: input.siteAccountId,
      source: "file-import",
      cookies,
      capturedAt: new Date().toISOString(),
      provenance: input.filePath,
    });
  }
}
