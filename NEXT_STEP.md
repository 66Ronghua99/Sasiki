# 当前最高优先级任务

**更新日期：2026-03-03**

## 目标：E2E Refinement 稳定性验证 & Agent System 重构准备

---

## 背景

本次 e2e 调试（`sasiki refine 60b002bc ... -i search_query="春季穿搭 男"`）定位并修复了两个根本问题：
1. `_compress_tree` 丢弃兄弟节点，导致 LLM 只能看到 1 个节点（DOM 空）
2. SPA 导航后未等待 JS 渲染，导致 Agent 误判页面未加载并陷入导航死循环

两个 bug 已修复并通过 149 个单元测试。

---

## 当前优先级

### P0：在真实小红书场景重新验证 E2E Refinement

```bash
uv run sasiki refine 60b002bc-a4c5-4695-9496-a1d9c7f4bc94 \
  -i search_query="春季穿搭 男" \
  --max-steps 30
```

验收标准：
- Agent 能看到完整 DOM（节点数 > 10）
- 不再出现无意义的重复导航
- Stage 能正常推进并产出 `*_final.yaml`

---

## 重要说明：Agent System 将有较大变动

后续 Agent 架构将进行较大重构（具体方向 TBD），当前的 `WorkflowRefiner` / `ReplayAgent` / `StageExecutor` 可能会被重新设计。

在重构前，当前重点是：
1. 用修复后的版本完成 E2E 验收，留存可用基线
2. 记录现有 Agent 设计的边界和已知问题，为重构提供输入

