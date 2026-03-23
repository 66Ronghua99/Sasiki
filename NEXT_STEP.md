# NEXT_STEP

- `P0` 开始 Phase 2 kernel narrowing：先把 `apps/agent-runtime/src/kernel/pi-agent-loop.ts` 从 `domain` / `infrastructure` 依赖里收窄出来，改成仅消费注入协议的更窄 engine seam。
