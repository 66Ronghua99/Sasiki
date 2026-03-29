import type {
  CredentialVerificationResult,
  CredentialVerificationStatus,
} from "../../shared/site-accounts";
import type { CredentialBundleStore } from "./credential-bundle-store";
import type { SiteAccountStore } from "./site-account-store";
import type { SiteRegistry } from "./site-registry";

export interface LoginVerifierOptions {
  siteAccountStore: SiteAccountStore;
  credentialStore: CredentialBundleStore;
  siteRegistry: SiteRegistry;
}

function cookieMatchesDomain(cookieDomain: string | undefined, allowedDomains: string[]): boolean {
  if (!cookieDomain) {
    return false;
  }

  return allowedDomains.some((allowedDomain) => {
    if (allowedDomain.startsWith(".")) {
      return cookieDomain === allowedDomain || cookieDomain.endsWith(allowedDomain);
    }

    return cookieDomain === allowedDomain || cookieDomain.endsWith(`.${allowedDomain}`);
  });
}

function cookieMatchesRequiredNames(
  cookieName: string | undefined,
  requiredCookieNames: string[],
): boolean {
  if (!cookieName) {
    return false;
  }

  return requiredCookieNames.includes(cookieName.toLowerCase());
}

export class LoginVerifier {
  public constructor(private readonly options: LoginVerifierOptions) {}

  public async verify(input: {
    siteAccountId: string;
  }): Promise<CredentialVerificationResult> {
    const account = await this.options.siteAccountStore.getById(input.siteAccountId);

    if (!account) {
      throw new Error(`Unknown site account: ${input.siteAccountId}`);
    }

    const credentialBundle = await this.options.credentialStore.getActiveForAccount(
      input.siteAccountId,
    );
    const site = this.options.siteRegistry.require(account.site);

    if (!credentialBundle) {
      const checkedAt = new Date().toISOString();
      await this.options.siteAccountStore.setVerificationStatus({
        siteAccountId: input.siteAccountId,
        status: "invalid",
        checkedAt,
      });

      return {
        siteAccountId: input.siteAccountId,
        status: "invalid",
        checkedAt,
        message: `No active credential bundle for ${site.verificationUrl}`,
      };
    }

    const isVerified = credentialBundle.cookies.some(
      (cookie) =>
        cookieMatchesDomain(cookie.domain, site.cookieDomains) &&
        cookieMatchesRequiredNames(cookie.name, site.requiredCookieNames),
    );
    const checkedAt = new Date().toISOString();

    const status: CredentialVerificationStatus = isVerified ? "verified" : "invalid";
    const result: CredentialVerificationResult = {
      siteAccountId: input.siteAccountId,
      status,
      checkedAt,
      message: isVerified
        ? `Verified against ${site.verificationUrl}`
        : `Credential cookies do not match ${site.verificationUrl}`,
    };

    await this.options.siteAccountStore.setVerificationStatus({
      siteAccountId: input.siteAccountId,
      status,
      checkedAt,
    });

    return result;
  }
}
