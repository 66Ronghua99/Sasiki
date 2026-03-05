# Watch-Once PR-3 Phase-2 Semantic Layer (2026-03-05)

## 1. Problem Statement
PR-3 Phase-1 已完成规则压缩与 hints 去重，但 compact 输出仍偏“动作日志语义”，缺少可直接给 agent 消费的自然语言 guide。  
Phase-2 目标是在不破坏 Phase-1 稳定性的前提下，引入可降级的 LLM 语义增强层。

Constraints:
- 必须保留 Phase-1 规则输出作为稳定基线。
- LLM 调用失败、超时或返回无效结果时，必须自动回退 Phase-1 输出。
- 不引入 run 路径资产消费（该项仍在 Phase-3）。

Non-goals:
- 本阶段不追求 deterministic replay。
- 本阶段不做跨资产排序优化。

## 2. Boundary & Ownership
- `src/runtime/sop-compact.ts`
  - 增加 semantic 开关、输出结构、fallback 标记。
- `src/core/semantic-compactor.ts` (new)
  - 封装 LLM 语义增强调用，输入为 rule-compact 摘要与关键 hints。
- `src/runtime/runtime-config.ts`
  - 新增 semantic 配置（`off|auto|on`、timeoutMs）。
- `src/index.ts`
  - 扩展 CLI：`sop-compact --semantic off|auto|on`。
- `src/infrastructure/logging/runtime-logger.ts`（可选）
  - 记录 `semantic_enabled/semantic_fallback` 事件。

## 3. Options & Tradeoffs
Option A: `auto`（默认）+ 强制 fallback（chosen）
- Pros: 兼顾可用性与稳定性。
- Cons: 输出质量受模型波动影响。

Option B: `on` 且失败即报错
- Pros: 行为简单。
- Cons: 稳定性差，不满足“可降级”约束。
- Rejected.

Option C: `off` 固定不开语义层
- Pros: 最稳。
- Cons: 无法验证语义增强价值。
- Rejected as main path.

## 4. Migration Plan
1. 新增 semantic 配置与 CLI 参数透传（不改变默认行为）。
2. 实现 `SemanticCompactor`：
   - 输入：`trace meta + high-level rule steps + hints`
   - 输出：`guide.md` 结构化章节（Goal/Steps/Fallback）。
3. 在 `sop-compact` 执行链中接入 semantic：
   - `off`: 仅 rule-based
   - `auto`: 尝试 semantic，失败回退
   - `on`: 尝试 semantic，失败仍回退并显式标注 fallback
4. 产物增强：
   - 新增 `guide_semantic.md`（成功时）
   - 在 `sop_compact.md` metadata 增加 `semanticMode` / `semanticFallback`
5. 完成验收并更新文档状态。

Rollback:
- 将 semantic mode 设为 `off` 即可回到 Phase-1 行为。

## 5. Acceptance Criteria
| ID | Scenario | Input | Expected Output | Evidence |
| --- | --- | --- | --- | --- |
| AC-1 | `off` 模式回归 | `sop-compact --semantic off` | 输出与 Phase-1 等价（无 semantic 依赖） | `sop_compact.md` |
| AC-2 | `auto` 正常增强 | `sop-compact --semantic auto` + 可用模型 | 生成 `guide_semantic.md`，并在 compact metadata 标记 `semanticFallback=false` | guide 文件 + metadata |
| AC-3 | fallback 生效 | `auto/on` + 人工制造模型失败/超时 | 仍生成 compact，metadata 标记 `semanticFallback=true` | runtime.log + compact metadata |
| AC-4 | 质量门禁 | 当前分支 | typecheck/build 通过 | 命令输出 |

## 6. Test Strategy
- Static:
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
- Manual:
  1. 同一 run 分别执行 `off/auto/on`。
  2. 对比 `sop_compact.md` metadata 与 `guide_semantic.md` 是否符合模式预期。
  3. 注入失败场景验证 fallback 标记与产物完整性。
