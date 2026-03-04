/**
 * Deps: none
 * Used By: domain/sop-trace.ts, runtime/sop-asset-store.ts
 * Last Updated: 2026-03-04
 */
export type RuntimeErrorCode =
  | "OBSERVE_NO_EVENTS_CAPTURED"
  | "OBSERVE_MULTI_TAB_NOT_SUPPORTED"
  | "SOP_TRACE_SCHEMA_INVALID"
  | "SOP_ASSET_INDEX_WRITE_FAILED"
  | "SOP_ASSET_NOT_FOUND";

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  readonly detail?: Record<string, unknown>;

  constructor(code: RuntimeErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.detail = detail;
  }
}
