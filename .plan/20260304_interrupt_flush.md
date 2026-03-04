# Interrupt Flush for In-Progress Runs (2026-03-04)

## 1. Problem Statement
When a run is manually interrupted (Ctrl+C), users currently have to wait for the full loop to finish before artifacts are persisted, and in abrupt exits partial traces can be lost.

Constraints:
- Preserve current runtime flow and artifact format.
- Avoid destructive termination; prefer graceful abort and immediate persistence.
- Keep behavior deterministic for repeated interrupts.

Non-goals:
- Replacing agent loop core implementation.
- Introducing queue/retry orchestration changes.

## 2. Boundary & Ownership
- `src/core/agent-loop.ts`
  - Owns in-flight trace snapshot and abort trigger.
- `src/runtime/agent-runtime.ts`
  - Owns active run context and partial artifact flush.
- `src/index.ts`
  - Owns process signal bridging (SIGINT/SIGTERM).

Single source of truth:
- In-flight trace lives in `AgentLoop` and is exposed via snapshot method.
- Artifact flushing is orchestrated by `AgentRuntime`.

## 3. Options & Tradeoffs
Option A: Keep final-only artifact write
- Pros: simplest.
- Cons: poor interruption UX; partial trace visibility is delayed/lost.
- Rejected.

Option B: On signal, call `abort()` and flush current snapshot immediately (chosen)
- Pros: fastest practical visibility with minimal changes.
- Cons: flushed files may still be partial and later overwritten by final write.
- Mitigation: this is acceptable; final write remains canonical.

Option C: Continuous streaming writes for every event
- Pros: strongest durability.
- Cons: higher complexity and IO overhead.
- Rejected for now.

## 4. Migration Plan
1. Add in-flight trace state in `AgentLoop.run()`.
2. Add `abort()` and `snapshotProgress()` APIs in `AgentLoop`.
3. In `AgentRuntime`, track active run artifacts and add `requestInterrupt()` to abort+flush.
4. In `index.ts`, register SIGINT/SIGTERM handlers that call `requestInterrupt()`.
5. Keep existing final write path unchanged.

Rollback points:
- Remove signal handlers in `index.ts`.
- Disable interrupt flush by reverting `requestInterrupt()`.

## 5. Test Strategy
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

Manual acceptance:
- Start a long run, press Ctrl+C once.
- Verify run dir has updated `steps.json/mcp_calls.jsonl/assistant_turns.json/runtime.log` quickly.
