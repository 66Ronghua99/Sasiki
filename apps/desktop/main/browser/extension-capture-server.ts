import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { assertNonEmptyString } from "../accounts/json-file-store";
import type { CredentialBundleStore, CredentialCookieRecord } from "../accounts/credential-bundle-store";
import type { SiteAccountStore } from "../accounts/site-account-store";
import {
  PendingExtensionCaptureStore,
  type PendingExtensionCaptureRecord,
} from "./pending-extension-capture-store";
import type { CredentialCaptureResult } from "../../shared/site-accounts";

export interface ExtensionCaptureRequest {
  site: string;
  cookies: CredentialCookieRecord[];
  accountId?: string;
}

export type ExtensionCaptureResult = CredentialCaptureResult | PendingExtensionCaptureRecord;

export interface ExtensionCaptureServerOptions {
  credentialStore: CredentialBundleStore;
  siteAccountStore: SiteAccountStore;
  pendingCaptureStore?: PendingExtensionCaptureStore;
  rootDir?: string;
  host?: string;
  port?: number;
  maxPayloadBytes?: number;
}

const DEFAULT_PORT = 55173;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 512;

export class ExtensionCaptureServer {
  private readonly credentialStore: CredentialBundleStore;
  private readonly siteAccountStore: SiteAccountStore;
  private readonly pendingCaptureStore: PendingExtensionCaptureStore;
  private readonly host: string;
  private readonly port: number;
  private readonly maxPayloadBytes: number;
  private server: Server | null = null;

  constructor(options: ExtensionCaptureServerOptions) {
    this.credentialStore = options.credentialStore;
    this.siteAccountStore = options.siteAccountStore;
    this.pendingCaptureStore =
      options.pendingCaptureStore ??
      new PendingExtensionCaptureStore({
        rootDir: options.rootDir ?? options.siteAccountStore.rootDir,
      });
    this.host = options.host ?? DEFAULT_HOST;
    this.port = options.port ?? DEFAULT_PORT;
    this.maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  }

  async handleCapture(input: ExtensionCaptureRequest): Promise<ExtensionCaptureResult> {
    const site = assertNonEmptyString(input.site, "site");
    const cookies = validateCookies(input.cookies);
    const capturedAt = new Date().toISOString();

    if (input.accountId) {
      const account = await this.siteAccountStore.getById(input.accountId);
      if (!account) {
        throw new Error(`Unknown site account: ${input.accountId}`);
      }
      if (account.site !== site) {
        throw new Error(`Site account ${input.accountId} is bound to ${account.site}, not ${site}`);
      }

      return this.credentialStore.save({
        siteAccountId: input.accountId,
        source: "browser-plugin",
        cookies,
        capturedAt,
        provenance: "browser-extension",
      });
    }

    return this.pendingCaptureStore.save({
      site,
      cookies,
      capturedAt,
      accountId: null,
    });
  }

  async listen(): Promise<void> {
    if (this.server) {
      throw new Error("Extension capture server is already listening");
    }

    this.server = createServer(async (request, response) => {
      try {
        await this.handleIncomingRequest(request, response);
      } catch (error) {
        this.writeError(response, 400, error instanceof Error ? error.message : String(error));
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.port, this.host, () => {
        this.server?.off("error", reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.server = null;
  }

  async listPendingCaptures(): Promise<PendingExtensionCaptureRecord[]> {
    return this.pendingCaptureStore.list();
  }

  private async handleIncomingRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== "POST" || request.url !== "/extension/capture") {
      this.writeError(response, 404, "Not found");
      return;
    }

    const payload = await this.readJsonBody(request);
    const result = await this.handleCapture(payload);
    this.writeJson(response, 200, result);
  }

  private async readJsonBody(request: IncomingMessage): Promise<ExtensionCaptureRequest> {
    const chunks: Buffer[] = [];
    let bytes = 0;

    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > this.maxPayloadBytes) {
        throw new Error(`extension capture payload exceeds ${this.maxPayloadBytes} bytes`);
      }
      chunks.push(buffer);
    }

    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw.trim()) {
      throw new Error("extension capture payload is empty");
    }

    const parsed = JSON.parse(raw) as Partial<ExtensionCaptureRequest>;
    return {
      site: assertNonEmptyString(String(parsed.site ?? ""), "site"),
      cookies: Array.isArray(parsed.cookies) ? (parsed.cookies as CredentialCookieRecord[]) : [],
      accountId: typeof parsed.accountId === "string" && parsed.accountId.trim() ? parsed.accountId.trim() : undefined,
    };
  }

  private writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
    response.writeHead(statusCode, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(`${JSON.stringify(body, null, 2)}\n`);
  }

  private writeError(response: ServerResponse, statusCode: number, message: string): void {
    this.writeJson(response, statusCode, { error: message });
  }
}

function validateCookies(cookies: CredentialCookieRecord[]): CredentialCookieRecord[] {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new Error("extension capture payload must include at least one cookie");
  }

  return cookies.map((cookie, index) => {
    if (!cookie || typeof cookie !== "object") {
      throw new Error(`cookie at index ${index} must be an object`);
    }

    const name = assertNonEmptyString(String(cookie.name ?? ""), "cookie.name");
    const value = assertNonEmptyString(String(cookie.value ?? ""), "cookie.value");

    return {
      name,
      value,
      domain: typeof cookie.domain === "string" ? cookie.domain : undefined,
      path: typeof cookie.path === "string" ? cookie.path : undefined,
      expires: typeof cookie.expires === "number" ? cookie.expires : undefined,
      httpOnly: typeof cookie.httpOnly === "boolean" ? cookie.httpOnly : undefined,
      secure: typeof cookie.secure === "boolean" ? cookie.secure : undefined,
      sameSite: typeof cookie.sameSite === "string" ? cookie.sameSite : undefined,
    };
  });
}
