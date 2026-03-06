# Runtime Config Root Resolution (2026-03-06)

## 1) Problem Statement
- 当前 `RuntimeConfigLoader.resolveWorkspaceRoot()` 通过 `PROGRESS.md + AGENTS.md` 判断“工作区根目录”。
- 这是错误耦合：文档只服务协作流程，不应参与 runtime 的工程路径解析。
- 直接后果：当文档缺失、移动或处于删除状态时，`runtime.artifactsDir` 等相对路径会错误回退到 `process.cwd()`。

## 2) Boundary & Ownership
- `apps/agent-runtime/src/runtime/runtime-config.ts`
  - 负责 runtime 配置加载与相对路径解析。
- `apps/agent-runtime/README.md`
  - 负责说明 artifacts 路径解析与代理环境下的本地 CDP 注意事项。
- `MEMORY.md`
  - 记录自测时的代理环境坑点，避免重复踩坑。

## 3) Options & Tradeoffs
- Option A（采用）：基于工程根标记解析相对路径，优先使用最近祖先目录中的 `.git`。
  - 优点：与工程本体绑定，和文档职责解耦。
  - 缺点：在非 git 目录中会回退到当前工作目录。
- Option B（拒绝）：继续依赖 `PROGRESS.md` / `AGENTS.md`。
  - 优点：实现简单。
  - 拒绝原因：把协作文档错误上升为运行时依赖。

## 4) Migration Plan
1. 将根目录解析从文档哨兵改为工程根标记。
2. `artifactsDir` 的相对路径继续保持“相对项目根目录”语义不变。
3. 在 README 与 MEMORY 中补充代理环境下本地 CDP 自测的 `NO_PROXY` 约定。

## 5) Test Strategy
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- 在 `apps/agent-runtime` 目录内验证：
  - `RuntimeConfigLoader.fromSources({ configPath: "runtime.config.json" }).artifactsDir`
  - 期望结果为仓库根 `artifacts/e2e`，而非 `apps/agent-runtime/artifacts/e2e`
