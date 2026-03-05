# Checklist: Runtime SOP Decoupling Refactor

- [x] `sop-compact` rule 逻辑拆分到 `sop-rule-compact-builder.ts`
- [x] `sop-compact` semantic 逻辑拆分到 `sop-semantic-runner.ts`
- [x] `sop-compact` markdown 渲染拆分到 `sop-compact-renderer.ts`
- [x] `SopCompactService` 收口为编排壳
- [x] `sop-demonstration-recorder` 拆分为 trace/guide builder
- [x] `npm --prefix apps/agent-runtime run typecheck` 通过
- [x] `npm --prefix apps/agent-runtime run build` 通过
