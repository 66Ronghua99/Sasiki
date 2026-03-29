export type CredentialBundleSource =
  | "embedded-login"
  | "browser-plugin"
  | "file-import";

export type CredentialVerificationStatus =
  | "unknown"
  | "verified"
  | "invalid"
  | "expired";

export interface SiteAccountSummary {
  id: string;
  site: string;
  label: string;
  activeCredentialId: string | null;
  activeCredentialSource: CredentialBundleSource | null;
  credentialUpdatedAt: string | null;
  verificationStatus: CredentialVerificationStatus;
  lastVerifiedAt: string | null;
  defaultRuntimeProfileId: string | null;
}

export interface UpsertSiteAccountInput {
  id?: string;
  site: string;
  label: string;
}

export interface ImportCookieFileInput {
  siteAccountId: string;
  filePath?: string;
}

export interface CredentialCaptureResult {
  siteAccountId: string;
  credentialBundleId: string;
  credentialSource: CredentialBundleSource;
  capturedAt: string;
  provenance: string | null;
}

export interface CredentialVerificationResult {
  siteAccountId: string;
  status: CredentialVerificationStatus;
  checkedAt: string;
  message: string | null;
}
