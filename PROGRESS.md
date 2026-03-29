# PROGRESS

## Doc Ownership
- `PROGRESS.md` 是项目状态面板，只记录当前代码基线、活跃主线、项目级风险、最近完成闭环与参考入口。
- `PROJECT_LOGS.md` 是 append-only 项目流水账，记录决策、尝试、推翻、转向与验证轨迹。
- `MEMORY.md` 只保留跨阶段仍然成立的经验、环境要求与稳定边界。

## Active Mainline
- `apps/desktop` Electron UI v1 已完成并合入 `mvp-dev`；当前前门不再只有 CLI。
- 当前唯一直接执行指针以 [NEXT_STEP.md](NEXT_STEP.md) 为准；P0 已切到 desktop live smoke / acceptance pass，而不是继续推进先前的 metric semantics slice。
- 先前的 `loadedKnowledgeCount` / `pageKnowledge` metric semantics 工作已降级为 deferred follow-up，不再是当前唯一主线。

## Project Status
- Desktop UI v1 已完成：新增 `apps/desktop`，并固定了 `main/ + preload/ + renderer/ + shared/` 四层结构。Electron main 是桌面 orchestration owner，`apps/agent-runtime` 继续是 `observe` / `sop-compact` / `refine` 的共享 workflow runtime owner。
- Desktop v1 已包含三类核心能力：`site account` 管理、`credential bundle` 导入/内置登录/Chromium 扩展采集，以及 `Workflows` / `Accounts` / `Runs` 三个主视图。
- Desktop workflow 语义已收口到当前产品口径：`observe` 只要求任务描述并可选 `site account`，`sop-compact` 继承 source run 上下文而不是要求额外账户选择，`refine` 只暴露 `site account` 而不暴露内部 `runtime profile`。
- 有限并行已接入桌面主进程：run state、interrupt、profile lease、事件转发、artifact 打开都在 Electron main 里统一编排，而不是散落到 renderer。
- Fresh verification 已完成：
  - `npm --prefix apps/desktop run lint`
  - `npm --prefix apps/desktop run test`
  - `npm --prefix apps/desktop run typecheck`
  - `npm --prefix apps/desktop run build`
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run test`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
  - `npm --prefix apps/agent-runtime run hardgate`
- Fresh hardgate evidence: `artifacts/code-gate/2026-03-29T19-34-58-029Z/report.json`

## Active Risks
- Desktop startup-failure cleanup 现在已显式 catch `stop()` rejection，避免 quit 路径 unhandled rejection；但 `apps/desktop/main/index.ts` 的 startup-failure branch 仍缺少 focused automated proof。
- `createDesktopMainContext.start()` 仍存在 partial-startup asymmetry 的 residual medium risk；当前 reviewer 结论是未被本轮放大，但还没有单独消化。
- Desktop v1 仍是 Chromium-only，并且当前自动化验证主要覆盖 macOS-oriented build/test seams；Windows 兼容只体现在进程边界和路径 ownership 设计上，尚未做实机 packaging / smoke。
- Runtime 侧仍保留独立 follow-up：TikTok customer-service refine 里的 redirect/path-mismatch recovery 还未关闭，但这已不阻塞 desktop v1 交付。

## Active Architecture Truth

```text
apps/agent-runtime/
  src/application/shell/   - CLI front door, runtime facade, workflow host, composition root
  src/application/observe/ - observe workflow semantics
  src/application/compact/ - sop-compact workflow semantics
  src/application/refine/  - refine bootstrap, tooling, executor, orchestration
  src/kernel/              - shared execution kernel
  src/infrastructure/      - browser, persistence, config, logging, MCP, HITL adapters

apps/desktop/
  main/                    - desktop orchestration owner (accounts, capture, run manager, profile leases, IPC)
  preload/                 - safe renderer bridge
  renderer/                - UI-only client for Workflows / Accounts / Runs
  shared/                  - desktop DTOs, channels, IPC contracts
  browser-extension/       - Chromium one-click cookie capture extension
```

- `apps/agent-runtime` 仍是 workflow semantics 的 canonical owner。
- `apps/desktop/main` 是 desktop privileges 的唯一 owner；renderer 不直接碰 filesystem、workflow runtime、cookie persistence 或 profile allocation。
- `runtime profile` 现在是内部执行容器模型，不是普通工作流表单的用户参数。

## Active References
- Entry docs:
  - [NEXT_STEP.md](NEXT_STEP.md)
  - [MEMORY.md](MEMORY.md)
  - [AGENT_INDEX.md](AGENT_INDEX.md)
  - [.harness/bootstrap.toml](.harness/bootstrap.toml)
- Project state:
  - [PROGRESS.md](PROGRESS.md)
  - [docs/project/current-state.md](docs/project/current-state.md)
  - [docs/architecture/overview.md](docs/architecture/overview.md)
- Append-only history:
  - [PROJECT_LOGS.md](PROJECT_LOGS.md)

## Active Spec / Plan
- Active completed desktop chain:
  - [docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md](docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md)
  - [docs/superpowers/plans/2026-03-29-electron-desktop-ui-v1-program-plan.md](docs/superpowers/plans/2026-03-29-electron-desktop-ui-v1-program-plan.md)
  - [docs/superpowers/plans/2026-03-29-desktop-foundation-and-shell-implementation.md](docs/superpowers/plans/2026-03-29-desktop-foundation-and-shell-implementation.md)
  - [docs/superpowers/plans/2026-03-29-desktop-runtime-facade-and-run-orchestration-implementation.md](docs/superpowers/plans/2026-03-29-desktop-runtime-facade-and-run-orchestration-implementation.md)
  - [docs/superpowers/plans/2026-03-29-desktop-accounts-credentials-and-capture-implementation.md](docs/superpowers/plans/2026-03-29-desktop-accounts-credentials-and-capture-implementation.md)
  - [docs/superpowers/plans/2026-03-29-desktop-renderer-workflows-accounts-runs-implementation.md](docs/superpowers/plans/2026-03-29-desktop-renderer-workflows-accounts-runs-implementation.md)
  - [docs/superpowers/plans/2026-03-29-desktop-integration-and-hardening-implementation.md](docs/superpowers/plans/2026-03-29-desktop-integration-and-hardening-implementation.md)
- Deferred runtime follow-up background:
  - [docs/superpowers/specs/2026-03-26-refine-page-level-retrieval-cues-design.md](docs/superpowers/specs/2026-03-26-refine-page-level-retrieval-cues-design.md)
  - [docs/superpowers/plans/2026-03-26-refine-page-level-retrieval-cues-implementation.md](docs/superpowers/plans/2026-03-26-refine-page-level-retrieval-cues-implementation.md)
