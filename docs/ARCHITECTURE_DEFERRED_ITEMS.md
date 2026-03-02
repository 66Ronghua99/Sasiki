# Sasiki 架构债务 - 暂缓解决项

> 本文档记录代码架构评审中识别的问题，这些问题已评估为当前阶段暂缓解决，待后续迭代处理。
> 创建日期: 2026-03-02

---

## F12: 单槽位连接模型（无需解决）

**位置:**
- `src/sasiki/server/websocket_server.py:48`
- `src/sasiki/server/websocket_server.py:49`

**现状:**
- 仍使用 `extension_ws` 和 `cli_ws` 单槽位存储

**决策:**
- **无需解决**。当前设计仅支持单 CLI + 单 Extension 场景，无需多会话支持。
- 未来如需多用户/多会话，需重新设计状态模型。

---

## F5: 双 Action 表示并存

**位置:**
- `src/sasiki/workflow/models.py:44` (`actions: list[str]`)
- `src/sasiki/workflow/models.py:45` (`action_details: list[dict]`)
- `src/sasiki/engine/stage_executor.py:243`（goal 构造时使用 action_details）

**现状:**
- `action_details` 已存在但未成为执行主输入
- 目前主要用于 goal 构造的 richer context

**建议:**
- 暂缓完全迁移，当前 hybrid 模式工作正常
- 未来如需确定性回放或稳定 locator，需将 `action_details` 提升为主输入
- `actions` 保留为 display-only 派生表示

---

## F6: 导入期副作用

**位置:**
- `src/sasiki/config.py:122`（`settings = Settings()` 全局实例）
- `src/sasiki/utils/logger.py:81`（`logger = configure_logging()` 全局实例）

**现状:**
- 导入时创建目录、配置日志
- 使测试隔离和库化嵌入困难

**建议:**
- 暂缓解决，当前 CLI 工具场景无影响
- **若未来需库化**（作为依赖被其他项目导入），必须改为 lazy 初始化：
  - `get_settings()` 替代全局 `settings`
  - `configure_logging_once()` 替代全局 `logger`
  - 入口点显式调用 bootstrap，库导入保持无副作用

---

## F2: run() 分支重复（可快速解决）

**位置:**
- `src/sasiki/engine/workflow_refiner.py:146`
- `src/sasiki/engine/workflow_refiner.py:157`
- `src/sasiki/engine/workflow_refiner.py:177`
- `src/sasiki/engine/workflow_refiner.py:185`

**现状:**
- 虽已提取 `_skip_tail()`，但 `failed`/`paused`/`checkpoint` 分支仍有重复模式
- 状态转换逻辑分散

**建议:**
- 可快速解决：提取统一的状态转换 helper
- 或暂缓：当前已实现主要 DRY，剩余重复为 4 处相似分支，风险可控

---

## F8: Lint 债务高（禁止新增）

**现状:**
- `ruff check` 仍有 ~244 项警告
- 多为风格一致性、PEP 604 (Optional[X] -> X | None) 等

**建议:**
- **暂缓清理存量**，避免产生巨大 diff
- **禁止新增债务**：新代码必须通过 ruff
- 逐步修复：每次修改文件时顺带清理该文件警告

---

## 总结

| 问题 | 优先级 | 行动 |
|------|--------|------|
| F12 单槽位 | 低 | 无需解决 |
| F5 双 action | 低 | 暂缓，未来确定性回放时解决 |
| F6 导入副作用 | 低 | 暂缓，库化时必须解决 |
| F2 分支重复 | 中 | 可快速解决，或继续观察 |
| F8 lint 债务 | 中 | 禁止新增，存量逐步清理 |

---

*注：F7 类型安全为当前主要攻坚目标，不在本文档范围内。*
