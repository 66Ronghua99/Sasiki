# Implementation Plan (2026-03-04)

## 1) 项目状态快照

| 模块 | 当前状态 | 证据 | 缺口 |
|---|---|---|---|
| Runtime 主链路（启动/运行/落盘） | 高完成度 | `src/runtime/agent-runtime.ts` 已串联 CDP、MCP、AgentLoop 与 artifacts | 失败分类与恢复策略仍偏弱 |
| Browser 接入（CDP + Cookie） | 高完成度 | `cdp-browser-launcher.ts`、`cookie-loader.ts` 已可自动拉起和注入 | 对“用户手工操作示教”仍是 0 能力 |
| Agent 观测工件 | 中高完成度 | 已有 `steps.json` / `mcp_calls.jsonl` / `assistant_turns.json` / `runtime.log` | 仅覆盖“agent 做了什么”，不能回答“用户怎么做” |
| E2E 闭环（搜帖/点赞/截图） | 部分完成 | `PROGRESS.md` 与 `artifacts/e2e/*` 显示点赞仍不稳定 | 尚未达到 `20/20` 连续通过 |
| 长程 SOP 复刻（看一次并学习） | 未开始 | 当前代码与文档均无“示教录制/归一化回放”模块 | 与终极目标存在直接缺口 |
| 上下文治理文件 | 基础已补齐 | `PROGRESS.md`、`MEMORY.md`、`NEXT_STEP.md` 已存在 | 需持续沉淀 `MEMORY.md` 的踩坑与预防策略 |

## 2) 推荐下一步 TODO（最小可执行）

**推荐 TODO（P0-NEXT）**：`Watch-Once 浏览器示教采集 v0`

### 选择理由
1. 直接对齐你的终极目标：“看用户做一次，然后学习并优化”。
2. 依赖已具备：CDP 连接、artifact writer、结构化日志均已在位。
3. 粒度可控：v0 只做“采集 + 归一化 + 落盘”，不做复杂学习算法，单 session 可完成核心能力。
4. 对现有 M2 闭环有正向价值：可用真实用户路径反哺 prompt 与动作约束，降低误操作。

### 预计工作量
- 核心实现 + 手动验收：约 1.5 ~ 2 小时

## 3) Proposed Changes

### A. 目标与进度对齐
- `[MODIFY]` `PROGRESS.md`
  - 新增 `Ultimate Goal` 段落：明确“长程 SOP 复刻（Watch Once -> Learn -> Optimize）”。
  - 在 TODO 增加 `P0-NEXT: Watch-Once 浏览器示教采集 v0`。
- `[MODIFY]` `MEMORY.md`
  - 维护已知坑、规约、验证经验（避免重复踩坑）。
- `[MODIFY]` `NEXT_STEP.md`
  - 维护单条执行指针：当前最高优先级就是示教采集 v0。

### B. 运行时能力（不破坏现有 run 模式）
- `[MODIFY]` `apps/agent-runtime/src/index.ts`
  - 新增 CLI 参数：`--mode run|observe`（默认 `run` 保持兼容）。
- `[MODIFY]` `apps/agent-runtime/src/runtime/runtime-config.ts`
  - 新增 `demonstration` 配置：`capture`, `maxDurationMs`, `redactSensitiveInputs`。
- `[MODIFY]` `apps/agent-runtime/src/runtime/agent-runtime.ts`
  - 新增 `observe()` 流程：启动浏览器并记录用户操作，不触发 AgentLoop。

### C. 示教记录与工件
- `[NEW]` `apps/agent-runtime/src/domain/sop-trace.ts`
  - 定义统一 action schema：`navigate/click/type/scroll/wait/assert`。
- `[NEW]` `apps/agent-runtime/src/core/sop-demonstration-recorder.ts`
  - 将原始事件归一化为可复用 SOP trace（去噪、去重、基本聚合）。
- `[NEW]` `apps/agent-runtime/src/infrastructure/browser/cdp-demonstration-recorder.ts`
  - 通过 CDP + 页面注入监听用户交互（点击、输入、导航、滚动）。
- `[MODIFY]` `apps/agent-runtime/src/runtime/artifacts-writer.ts`
  - 新增输出：
    - `demonstration_raw.jsonl`
    - `demonstration_trace.json`
    - `sop_draft.json`

## 4) 关键设计决策

1. **先采“结构化动作”，不采“全量 DOM 快照”**
   - 原因：减小噪音与敏感信息暴露风险，先保证可复用性。
2. **observe 与 run 模式隔离**
   - 原因：避免影响现有闭环验证链路；回滚简单。
3. **默认开启输入脱敏**
   - 原因：防止 token、账号、隐私文本泄露到 artifacts。

### 需要你确认的决策
1. v0 是否仅支持“单标签页示教”，多标签页放 v1？
2. 是否允许记录截图缩略图（默认建议关闭，仅记录路径与元数据）？

## 5) Verification Plan

### 单元测试（计划）

| 场景 | 目标 | 预期 |
|---|---|---|
| 事件归一化 | 原始 click/type/nav 事件映射到统一 schema | 输出 action 类型稳定、字段完整 |
| 去重与合并 | 连续相同输入/滚动事件去噪 | trace 长度显著下降且语义不变 |
| 脱敏 | 输入中出现手机号/token/cookie 字段 | artifacts 中被掩码 |
| 兼容性 | `--mode run` 默认流程 | 与当前行为一致，不引入回归 |

### 运行命令（本 TODO 完成后）
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

### 手动验收
1. 执行 `npm --prefix apps/agent-runtime run dev -- --mode observe "示教：打开小红书并完成一次搜索进帖点赞截图"`。
2. 人工在浏览器完成一次真实操作。
3. 中断或结束录制。
4. 检查 `artifacts/e2e/{run_id}/` 下是否生成 `demonstration_raw.jsonl`、`demonstration_trace.json`、`sop_draft.json`。
5. 抽样检查 trace 是否可读、关键动作顺序是否正确、敏感字段是否脱敏。

## 6) 与现有 P0 的衔接

- 本 TODO 完成后，当前 `P0 优化任务 prompt 与动作约束` 将有真实示教数据支撑，不再主要依赖拍脑袋调 prompt。
- `P0 稳定性策略（重试/stall/失败枚举）` 可直接基于示教 trace 提炼“失败前导信号”。
