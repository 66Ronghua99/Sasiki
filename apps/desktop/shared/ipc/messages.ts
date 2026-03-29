import type {
  CredentialCaptureResult,
  CredentialVerificationResult,
  ImportCookieFileInput,
  SiteAccountSummary,
  UpsertSiteAccountInput,
} from "../site-accounts";
import type {
  CompactRunInput,
  DesktopRunEvent,
  DesktopRunSummary,
  ObserveRunInput,
  RefineRunInput,
} from "../runs";
import type { SopSkillSummary } from "../skills";
import { desktopChannels } from "./channels";

export interface ListSiteAccountsRequest {}

export interface ListSiteAccountsResponse {
  accounts: SiteAccountSummary[];
}

export interface UpsertSiteAccountRequest {
  input: UpsertSiteAccountInput;
}

export interface UpsertSiteAccountResponse {
  account: SiteAccountSummary;
}

export interface LaunchEmbeddedLoginRequest {
  siteAccountId: string;
}

export interface LaunchEmbeddedLoginResponse {}

export interface ImportCookieFileRequest {
  input: ImportCookieFileInput;
}

export interface ImportCookieFileResponse {
  result: CredentialCaptureResult;
}

export interface VerifyCredentialRequest {
  siteAccountId: string;
}

export interface VerifyCredentialResponse {
  result: CredentialVerificationResult;
}

export interface StartObserveRunRequest {
  input: ObserveRunInput;
}

export interface StartObserveRunResponse {
  runId: string;
}

export interface StartCompactRunRequest {
  input: CompactRunInput;
}

export interface StartCompactRunResponse {
  runId: string;
}

export interface StartRefineRunRequest {
  input: RefineRunInput;
}

export interface StartRefineRunResponse {
  runId: string;
}

export interface InterruptRunRequest {
  runId: string;
}

export interface InterruptRunResponse {
  interrupted: boolean;
}

export interface ListRunsRequest {}

export interface ListRunsResponse {
  runs: DesktopRunSummary[];
}

export interface SubscribeRunRequest {
  runId: string;
}

export interface SubscribeRunResponse {
  subscribed: boolean;
  eventChannel: typeof desktopChannels.runs.events;
}

export interface SubscribeAllRunRequest {}

export interface SubscribeAllRunResponse {
  subscribed: boolean;
  eventChannel: typeof desktopChannels.runs.events;
}

export interface UnsubscribeAllRunRequest {}

export interface UnsubscribeAllRunResponse {
  unsubscribed: boolean;
}

export interface DesktopRunEventMessage {
  runId: string;
  event: DesktopRunEvent;
}

export interface OpenRunArtifactsRequest {
  runId: string;
}

export interface OpenRunArtifactsResponse {
  opened: boolean;
}

export interface ListSkillsRequest {}

export interface ListSkillsResponse {
  skills: SopSkillSummary[];
}
