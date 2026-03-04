# PRD: Watch-Once V0 (2026-03-04)

## 1) Context

- Background:
  - 当前 Node runtime 已具备 agent 执行与工件落盘能力，但缺少“看用户做一次并沉淀 SOP 资产”的能力。
  - 项目终极目标已明确为：`Watch Once -> Learn -> Optimize`。
- Problem statement:
  - 没有示教采集与可复用资产层，导致长程 SOP 复刻仍依赖 prompt 试错，难以稳定扩展到不同网站和任务。
- Why now:
  - 用户已明确当前阶段优先级为 `Watch-Once v0`，且接受先做最小闭环（单标签、非敏感站点、先不脱敏）。

## 2) Objective

- Business objective:
  - 建立“用户示教 -> 结构化 SOP 资产 -> 可反复检索调用”的最小产品闭环。
- User objective:
  - 用户演示一次浏览器流程后，系统能保存为可理解、可复用文件，并在后续任务中调用。
- Non-goals (V0):
  - 多标签页完整支持。
  - 敏感信息治理（脱敏/合规策略引擎）。
  - 企业协作系统（如 Feishu）主线支持。
  - 全自动优化器与完全确定性回放引擎。

## 3) Scope

- In scope:
  - 新增 `observe` 采集模式（与 `run` 隔离）。
  - 单标签页用户交互事件采集与归一化。
  - 生成并保存 4 类工件：
    - `demonstration_raw.jsonl`
    - `demonstration_trace.json`
    - `sop_draft.md`
    - `sop_asset.json`
  - 本地索引与检索（按 site/tag/taskHint）。
  - SOP 资产存储根目录固定为 `~/.sasiki/sop_assets/`。
  - 多站点验证（Baidu + 抖音/TikTok（二选一）+ 小红书）。
- Out of scope:
  - 多标签事件图谱与 tab 切换回放。
  - 自动脱敏与 retention 策略引擎。
  - Feishu 等高动态、登录敏感场景。
- Assumptions:
  - V0 阶段只在非敏感网站验证。
  - 用户可接受“先资产沉淀，再迭代消费执行强约束”。
- Constraints (time, team, tech, compliance):
  - 技术栈固定：Node + pi-agent-core + Playwright MCP。
  - 默认 `run` 模式必须保持兼容，不得回归。
  - 本阶段允许记录原文（风险已接受，见第8节）。

## 4) Functional Requirements

| ID | Requirement | Rule | Priority |
| --- | --- | --- | --- |
| FR-1 | 采集模式入口 | CLI 支持 `--mode observe`，默认仍为 `run` | P0 |
| FR-2 | 单标签页示教采集 | 仅采集当前标签页动作；遇多标签事件只记录告警不纳入主流程 | P0 |
| FR-3 | 原始事件落盘 | 每次示教必须写入 `demonstration_raw.jsonl` | P0 |
| FR-4 | 规范化 trace 生成 | 每次示教必须写入 `demonstration_trace.json`，字段满足第5节契约 | P0 |
| FR-5 | 可读 SOP 草稿 | 每次示教必须写入 `sop_draft.md` | P0 |
| FR-6 | 资产元数据 | 每次示教必须写入 `sop_asset.json`，并可被索引 | P0 |
| FR-7 | 资产检索 | 支持按 `site/tag/taskHint` 查找已保存 SOP 资产 | P1 |
| FR-8 | 兼容性隔离 | `observe` 失败不影响 `run` 模式；保留独立回滚点 | P0 |
| FR-9 | 站点验证覆盖 | 支持 Baidu、抖音/TikTok（二选一）、小红书示教产物生成 | P0 |
| FR-10 | Agent 可消费解释 | 资产必须包含自然语言执行指引；且在不可直接操作时提供 Web element 辅助信息（selector/text/role/hint） | P0 |

## 5) Data Contracts

## 5.1 demonstration_trace contract (canonical)

```json
{
  "traceVersion": "v0",
  "traceId": "YYYYMMDD_HHMMSS_mmm",
  "mode": "observe",
  "site": "example.com",
  "singleTabOnly": true,
  "taskHint": "string",
  "steps": [
    {
      "stepIndex": 1,
      "timestamp": "ISO-8601",
      "action": "navigate|click|type|press_key|scroll|wait",
      "target": { "type": "url|selector|text|key", "value": "string" },
      "input": {},
      "page": { "urlBefore": "string", "urlAfter": "string" },
      "assertionHint": { "type": "optional", "value": "optional" },
      "rawRef": "event-id"
    }
  ]
}
```

Contract rules:
- `traceVersion` 必填且固定为 `v0`（V0阶段）。
- `steps` 按时间递增、`stepIndex` 连续。
- `action` 仅允许 6 个词表值。
- 所有步骤必须可回溯到 `rawRef`。

## 5.2 sop_asset contract (reusable index unit)

```json
{
  "assetVersion": "v0",
  "assetId": "sop_YYYYMMDD_HHMMSS_mmm",
  "site": "example.com",
  "taskHint": "string",
  "tags": ["search", "open-detail"],
  "tracePath": "path/to/demonstration_trace.json",
  "draftPath": "path/to/sop_draft.md",
  "guidePath": "path/to/guide.md",
  "webElementHints": [
    {
      "stepIndex": 2,
      "purpose": "fallback_when_click_fails",
      "selector": "string",
      "textHint": "string",
      "roleHint": "button"
    }
  ],
  "createdAt": "ISO-8601"
}
```

Index keys:
- `site`
- `tags[]`
- `taskHint`（关键词匹配）

## 6) Acceptance Criteria

| ID | Scenario | Input | Expected Output | Evidence |
| --- | --- | --- | --- | --- |
| AC-1 | Baidu 基线示教 | 用户完成“搜索并打开结果” | 生成 4 类工件且字段有效 | run 目录工件 + trace schema 校验 |
| AC-2 | 抖音/TikTok 示教 | 用户完成“搜索关键词并打开目标内容页” | 生成 4 类工件且字段有效 | run 目录工件 + trace schema 校验 |
| AC-3 | 小红书示教 | 用户完成“搜索并打开帖子” | 生成 4 类工件且字段有效 | run 目录工件 + trace schema 校验 |
| AC-4 | 资产检索 | 输入 site/tag/taskHint | 命中并返回对应 `sop_asset` | 索引查询日志/结果 |
| AC-5 | Agent 可消费解释 | 加载一个 `sop_asset` | 生成自然语言执行指引，且包含失败场景可用的 Web element 辅助信息 | guide 文件 + 辅助字段校验 + 解释日志 |
| AC-6 | 兼容性 | 运行原 `run` 模式任务 | 与现有行为一致，无回归 | typecheck/build + 现有 run 结果 |

V0 pass threshold:
- AC-1 ~ AC-4 必须通过。
- AC-5 必须通过。
- AC-6 必须通过。

## 7) Non-Functional Requirements

- NFR-1 性能开销：
  - 采集模式不应造成明显卡顿；采集逻辑不得阻塞主线程关键路径。
- NFR-2 工件可控：
  - 单次 trace 文件应可读可解析，避免无界膨胀（V0 先监控、V1 加上限策略）。
- NFR-3 可维护性：
  - `run` 与 `observe` 必须模式隔离；异常可快速定位到独立模块。
- NFR-4 版本兼容：
  - trace/asset 需显式版本字段，支持后续 V1 演进。

## 8) Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| 当前不做脱敏 | 存在潜在数据泄漏风险 | V0 限定非敏感站点；V1 引入脱敏策略 |
| 无固定保留周期 | 资产索引持续增长 | V1 增加 prune/归档机制 |
| 多站点 DOM 差异 | trace 质量不一致 | 限制动作词表 + 版本化 schema |
| 抖音/TikTok 页面动态与风控波动 | 采集稳定性与可重复性受影响 | 仅验证公开流程；失败时依赖 Web element hints 兜底 |
| 新模式引入回归 | 影响现有 run 链路 | `--mode` 隔离 + 默认 run 不变 + 可回滚 |

Accepted debt (explicit):
- 脱敏策略后置到 V1。
- 资产 retention 策略后置到 V1。

## 9) Delivery Plan

- Milestone 1 (minimum loop):
  - 冻结 `trace/asset` schema
  - 上线 `observe` 模式
  - 完成 raw/trace/draft/asset 4工件落盘
- Milestone 2 (stabilization):
  - 完成 Baidu + 抖音/TikTok + 小红书三站点验证
  - 完成本地索引检索
  - 通过 `typecheck/build`
- Milestone 3 (expansion):
  - 多标签支持（V1）
  - 脱敏与数据治理（V1）
  - 更强消费执行与优化链路（V1+）

## 10) Rollback & Launch Control

- Launch switch:
  - `--mode observe` 开启示教链路；默认仍 `run`。
- Rollback strategy:
  - 若 `observe` 失败，立即禁用该模式路径，不影响 `run`。
  - 原有构建与运行命令保持不变。

## 11) Frozen Decisions

1. 站点B验证对象固定为：`抖音 或 TikTok（二选一，按可访问性择一）`。
2. SOP 资产存储根目录固定为：`~/.sasiki/sop_assets/`。
3. V0 验收强制要求 AC-5 通过：资产必须可被消费，并含自然语言指引与 Web element 辅助信息。

## 12) Quality Gates

Must pass before claiming completion:
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
