import type { CredentialCookieRecord, CredentialBundleStore } from "./credential-bundle-store";

export interface EmbeddedLoginCookiesSession {
  cookies: {
    get(filter: unknown): Promise<CredentialCookieRecord[]>;
  };
}

export interface EmbeddedLoginServiceOptions {
  credentialStore: CredentialBundleStore;
}

export class EmbeddedLoginService {
  public constructor(private readonly options: EmbeddedLoginServiceOptions) {}

  public async completeLogin(
    input: { siteAccountId: string },
    session: EmbeddedLoginCookiesSession,
  ) {
    const cookies = await session.cookies.get({});

    return this.options.credentialStore.save({
      siteAccountId: input.siteAccountId,
      source: "embedded-login",
      cookies,
      capturedAt: new Date().toISOString(),
      provenance: "embedded-window",
    });
  }
}
