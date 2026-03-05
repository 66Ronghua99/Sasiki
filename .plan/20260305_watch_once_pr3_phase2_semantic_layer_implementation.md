# Watch-Once PR-3 Phase-2 Semantic Layer Implementation (2026-03-05)

## 1. Scope Delivered
- 已按设计稿接入 `off|auto|on` 语义增强开关。
- 已新增 `SemanticCompactor`，通过 `@mariozechner/pi-ai completeSimple` 生成 `guide_semantic.md`。
- 已在 `sop-compact` 主链路接入 fallback：语义失败不阻塞 `sop_compact.md` 产物。
- 已在 compact metadata 输出 `semanticMode/semanticFallback` 与失败原因。
- 已在运行目录 `runtime.log` 追加 `semantic_compaction_succeeded/fallback` 事件。

## 2. File-Level Changes
- `apps/agent-runtime/src/core/semantic-compactor.ts` `[NEW]`
  - 语义增强调用封装（超时控制、文本提取、错误上抛）。
- `apps/agent-runtime/src/runtime/sop-compact.ts` `[MODIFY]`
  - rule-based 压缩与 semantic 步骤解耦。
  - 写入 `guide_semantic.md`（成功场景）与 compact metadata 标记。
- `apps/agent-runtime/src/runtime/runtime-config.ts` `[MODIFY]`
  - 新增 `semantic.mode`、`semantic.timeoutMs` 配置解析。
- `apps/agent-runtime/src/index.ts` `[MODIFY]`
  - 新增 CLI 参数 `--semantic off|auto|on` 并透传给 `SopCompactService`。
- `apps/agent-runtime/runtime.config.example.json` `[MODIFY]`
  - 新增 semantic 配置示例。
- `apps/agent-runtime/README.md` `[MODIFY]`
  - 新增 semantic 用法与产物说明。

## 3. Verification
- Static:
  - `npm --prefix apps/agent-runtime run typecheck` 通过
  - `npm --prefix apps/agent-runtime run build` 通过
- Manual (`run_id=20260305_134516_980`):
  - `--semantic off`: 成功，`semanticFallback=false`
  - `--semantic auto`: 成功增强，生成 `guide_semantic.md`，`semanticFallback=false`
  - `--semantic on`: 可成功增强，也可在异常时回退，均不阻塞 compact
  - `runtime.log` 可见 `semantic_compaction_succeeded/fallback` 事件

## 4. AC Status
- AC-1: Pass
- AC-2: Pass（`2026-03-05 18:14`，`semanticMode=auto` 且 `semanticFallback=false`）
- AC-3: Pass
- AC-4: Pass

## 5. Risk & Follow-up
- 风险：模型额度/网络抖动时，语义层会频繁 fallback，影响增强稳定性但不影响主产物。
- 建议：
  1. 在 fallback 原因里区分 `timeout/network/auth/quota`，便于后续告警与统计。
  2. 进入 PR-3 Phase-3，将资产检索与消费接入 `run` 主链路。
