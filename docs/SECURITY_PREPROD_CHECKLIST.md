# Sasiki Pre-Production Security Checklist

Last updated: 2026-03-02
Status: Draft (local testing phase)

## Scope

This document records security risks identified during local-stage code audit and defines mandatory hardening tasks before any production-like deployment.

Current assumption:
- Server and extension WebSocket are used on local machine for development/testing.
- No internet-facing deployment yet.

## Current Risk Summary

### Critical
- WebSocket `session_id` is user-controlled and used directly in output filename.
- Risk: path traversal / arbitrary file write (`*.jsonl`) outside recordings directory.

### High
- WebSocket channel has no authentication and no strict origin enforcement.
- Risk: any local process or malicious web page can connect to `ws://localhost:<port>` and send control/action messages.

### Medium
- No hard limits on action/session accumulation in memory.
- Risk: memory exhaustion (local DoS).

### Medium
- Raw payloads may be logged on parsing/handler errors.
- Risk: leakage of sensitive typed content in logs.

### Low
- `refine --output-suffix` is used in filename construction without strict sanitization.
- Risk: local path traversal if untrusted input reaches this option.

## Local Testing Position (Now)

For local-only testing, risk is acceptable temporarily **with constraints**:
- Keep bind host as `localhost` only.
- Do not expose WebSocket port via reverse proxy/tunnel.
- Avoid running unknown browser extensions/pages while recording.

This is a temporary exception, not a production baseline.

## Mandatory Before Production

## 1) Input and Path Safety
- [ ] Validate `session_id` using strict allowlist (e.g. `^[a-zA-Z0-9_-]{1,64}$`).
- [ ] Resolve and verify final recording path is inside configured recordings directory.
- [ ] Sanitize `output_suffix` using same allowlist strategy.

Acceptance:
- Traversal payloads like `../../x`, absolute paths, and separators are rejected.

## 2) WebSocket Authentication and Trust Boundary
- [ ] Add handshake auth token (CLI + extension).
- [ ] Reject unauthenticated clients before processing action/control messages.
- [ ] Enforce role-based message policy (`extension` can send `action`; `cli` can send `control`).
- [ ] Restrict allowed origins (`chrome-extension://<id>` and trusted local origins as needed).

Acceptance:
- Unauthorized client cannot start/stop recording or inject actions.

## 3) Resource Limits and Abuse Control
- [ ] Max actions per session.
- [ ] Max concurrent/retained sessions.
- [ ] Message size limits and malformed message fail-fast policy.
- [ ] Optional rate limiting for control/action messages.

Acceptance:
- Flooding attempts are bounded and do not crash service.

## 4) Sensitive Data Handling
- [ ] Remove raw payload logging by default.
- [ ] Redact sensitive fields in logs (`value`, tokens, credentials, long free text).
- [ ] Add debug flag to explicitly enable deeper payload logs for troubleshooting.

Acceptance:
- Normal logs do not expose credentials/PII.

## 5) Security Testing Gate
- [ ] Add unit tests for path traversal rejection.
- [ ] Add integration tests for unauthenticated WebSocket rejection.
- [ ] Add tests for role spoofing / cross-role message rejection.
- [ ] Add DoS guard tests (action/session/message limits).

Acceptance:
- CI includes and passes security gate tests before release.

## Release Gate Policy

Before first production attempt, all items in sections 1-5 must be completed.
If any item remains open, deployment is blocked.

## Notes

- This checklist is intentionally minimal and focused on current architecture.
- Additional controls (TLS, secret rotation, audit trail, incident response) should be added once remote/multi-user deployment is planned.
