# Sasiki - 精简进度看板

**最后更新：2026-03-03** (Phase 3 AI-Native 重构方案确定，进入实施阶段)

## 当前主线

仅维护 **browser-first** 路线：
Chrome Extension 录制 -> Python 服务接入 -> Skill 生成 -> Playwright 执行。
屏幕录制路线已下线。

---

## 当前状态（快照）

| 阶段                 | 状态      | 结果                                                                                       |
| -------------------- | --------- | ------------------------------------------------------------------------------------------ |
| Phase 1 录制链路     | ✅ 已完成 | Extension + WebSocket + JSONL 落盘已打通                                                   |
| Phase 1 真实场景验收 | 🔄 进行中 | 需持续补充站点级 E2E 验证                                                                  |
| Phase 2 Skill 生成   | ✅ 已完成 | Parser + Generator + CLI + LLM 集成全部打通，E2E 验收通过；后续持续优化迭代                |
| Phase 3 执行引擎     | 🟢 进行中 | WorkflowRefiner 核心调度器已完成，支持分 Stage 执行、Checkpoint 暂停、变量替换与最终 Workflow 产出 |
| Phase 3 Retry & HITL | ✅ 已完成 | Retry 上下文传递、HumanInteractionHandler 抽象接口、CLI/NonInteractive 双实现 |
| Phase 3 AI-Native 重构 | 🔵 设计完成 | 架构重构方案确定，见 `docs/AI_NATIVE_REDESIGN.md`，P0 实施中 |

---

## 已完成（近期关键项）

### Phase 3 AI-Native 重构（设计阶段完成）

- 识别并记录当前 WorkflowRefiner 的根本性架构问题：Agent 被当作脚本执行器（actions list 作为指令，而非目标）
- 完成全链路 AI-Native Pipeline 设计（`docs/AI_NATIVE_REDESIGN.md`）：
  - **WorkflowSpec 变更**：Stage 从 `actions list` → `objective + success_criteria + context_hints + reference_actions`
  - **AriaSnapshot**：去掉 node_id，改用 role+name 寻址 + dom_hash 停滞检测
  - **EpisodeMemory**：结构化步骤日志，含 semantic_meaning + progress_assessment 语义叙事
  - **AgentDecision**：target 用 role+name，Playwright `get_by_role()` 执行
  - **分层架构预留**：Layer 1（执行）/ Layer 2（语义理解）/ Layer 3（意图+API化，Path B 未来方向）
- 定义两条演化路径：Path A（忠实复刻+优化）/ Path B（意图理解+革命性优化）
- 制定 14 个 TODO，P0→P2 优先级分层
### Previous Phase 3 design
- 编写 `docs/PHASE3_REPLAY_DESIGN.md` 确定执行引擎架构与观测、执行双重策略。
- 引入 `playwright` 依赖，作为自动化执行基础。
- 实现 `PlaywrightEnvironment` (支持 CDP 连接或指定独立 `user_data_dir` 保留登录态)。
- 实现 `SessionManager`，支持通过 JSON 文件（如 EditThisCookie 导出）动态注入 Cookie 以绕过单点登录限制。
- 实现 `AccessibilityObserver`，通过 CDP 获取 `Accessibility.getFullAXTree` 并高比例压缩生成适合 LLM 阅读的树状 `live_dom_snapshot.json`。
- 实现 `ReplayAgent` 及 `AgentAction` Pydantic 模型，连通 LLM 推理与 Playwright `mouse.click` / `keyboard.type` 坐标级精准执行。
- 打通 DashScope (MiniMax-M2.5) 与 OpenRouter 的灵活切换。
- 实现 `WorkflowRefiner` 核心调度器，支持 Workflow 分 Stage 循环执行、变量解析、Checkpoint 暂停与 `*_final.yaml` 产出。
- 新增 `sasiki refine <workflow_id>` CLI 命令，提供试运行提纯功能。
- 编写 24 个单元测试覆盖 WorkflowRefiner 核心逻辑。
- **Retry & HITL 重构**（详见 `docs/retry-hitl-redesign.md`）：
  - 新增 `RetryContext` 模型，支持 retry 时传递失败上下文（错误类型、失败 action、失败原因）。
  - 增强 `ReplayAgent.step_with_context()` 方法，支持 retry context 和 action history。
  - 实现 `HumanInteractionHandler` 抽象接口，引擎层只依赖接口，不依赖具体实现。
  - 实现 `CLIInteractiveHandler`（`src/sasiki/commands/handlers.py`）提供 CLI 交互式 HITL。
  - 实现 `NonInteractiveHandler`（`src/sasiki/engine/handlers/auto.py`）用于自动化/测试场景。
  - 重构 `WorkflowRefiner` 以通过依赖注入使用 handler 接口，支持非交互式模式（`--no-interactive`）。
  - 新增 31 个单元测试覆盖 handler 接口和 retry 逻辑。

### Phase 2 Skill 生成

- `RecordingParser` 模块：JSONL 解析、元数据提取、target_hint 压缩、事件过滤/分组。
- `SkillGenerator` 模块：LLM Prompt 构建、Workflow 提取与转换、自动保存支持。
- CLI `generate` 命令：`sasiki generate <recording.jsonl> [--preview]`。
- 完整测试覆盖：36 个单元测试全部通过。
- Phase 2 输入输出契约明确：event stream → compact narrative → LLM → Workflow YAML。

### Code Quality & Refactoring (New)

- Split large files for better maintainability:
  - `src/sasiki/cli.py` -> `src/sasiki/commands/`
  - `src/sasiki/workflow/skill_generator.py` -> `skill_models.py`, `action_formatter.py`
  - `src/sasiki/workflow/recording_parser.py` -> `recording_models.py`
  - `src/sasiki/server/websocket_server.py` -> `recording_session.py`
- Added `tests/test_action_formatter.py` and updated existing tests.

### Phase 2 预期改动设计（改动前 Review）

- 目标：降低“Skill 总结过度压缩”风险，保证 page context 与 DOM 检索关键信息稳定保留。
- 策略：从“LLM 直接生成最终 Workflow”调整为“两阶段”：
  1) `structured_packet`（代码构建，结构化输入）
  2) `semantic_plan`（LLM 仅做阶段识别/关键摘要）
  3) `deterministic_assembler`（代码确定性组装最终 Workflow）
- 字段保留策略：采用**增强白名单**，强制保留 `page_context`、navigation 字段、`target_hint`（含 class/id/testid/sibling 等上下文）及动作原始关键字段。
- 兼容性：`WorkflowStage.actions` 保留；新增 `action_details` 承载结构化动作明细；旧 YAML/JSON 可继续读取。
- 风险控制：先双轨支持（legacy narrative + structured mode），通过回归测试后再默认切换；失败时可回退到 legacy 流程。

---

## 当前优先级（按顺序）

1. **P1：EpisodeMemory**（结构化 step log 替代 history strings）
2. **P1：SemanticNarrative 字段**（`semantic_meaning` + `progress_assessment`）
3. **P1：StagnationDetector**（dom_hash 停滞检测）
4. 见 `NEXT_STEP.md` 和 `docs/AI_NATIVE_REDESIGN.md` 完整 TODO 列表

---

## 本周执行项

### Phase 1（录制）

- [X] 完成 1 条标准化录制验收任务（推荐小红书搜索流程）
- [X] 增加录制结果自动检查脚本（事件分布/字段完整性/时序）
- [X] 协议补齐 `scroll_load` 相关字段（服务端模型对齐）

### Phase 3（执行引擎）

- [X] 设计 Replay Engine 架构与核心逻辑。
- [X] 实现页面观测器 (`AccessibilityObserver`) 与精简 DOM 树压缩。
- [X] 实现单步决策代理 (`ReplayAgent`) 并打通 Playwright 坐标执行。
- [X] 实现独立浏览器上下文测试与持久化 Cookie 注入 (`SessionManager`)。
- [X] 验证连续目标执行（Agent Loop）并识别出状态记忆问题。
- [X] 构建 `WorkflowRefiner` 读取 YAML 并拆分 Stage 执行。
- [X] 实现 Retry 上下文传递与失败信息分类 (`_classify_error`)。
- [X] 实现 HITL 抽象接口与 CLI/NonInteractive 双模式支持。
- [ ] 设计 Agent Prompt Cache 与 Message History 机制以降低长上下文成本。
- [ ] 在真实复杂网站（如小红书）验证执行稳定性与准确率。

---

## 快速验证命令

### Phase 1 - 录制

```bash
# 1) 启动服务
sasiki server start

# 2) 开始录制
sasiki record --name "e2e_verify"

# 3) 查看录制结果
cat ~/.sasiki/recordings/browser/e2e_verify.jsonl

# 4) 运行 E2E 测试
PYTHONPATH=src uv run --with pytest --with pytest-asyncio --with websockets pytest -q tests/test_phase1_websocket_flow.py
```

### Phase 2 - Skill 生成

```bash
# 1) 预览 LLM 输入（不调用 LLM）
sasiki generate ~/.sasiki/recordings/browser/xhs_e2e.jsonl --preview

# 2) 生成 Workflow（调用 LLM）
sasiki generate ~/.sasiki/recordings/browser/xhs_e2e.jsonl --name "小红书搜索" --description "搜索并浏览小红书笔记"

# 3) 生成但不保存（Dry Run）
sasiki generate ~/.sasiki/recordings/browser/xhs_e2e.jsonl --dry-run

# 4) 查看生成的 Workflow
sasiki list
sasiki show <workflow_id>

# 5) 试运行 Workflow
sasiki run <workflow_id> --dry-run

# 6) 运行 Phase 2 测试
PYTHONPATH=src uv run --with pytest tests/test_recording_parser.py tests/test_skill_generator.py -v

### Phase 3 - 执行引擎

```bash
# 1) 运行 WorkflowRefiner 单元测试
PYTHONPATH=src uv run --with pytest --with pytest-asyncio pytest tests/engine/test_workflow_refiner.py -v

# 2) 试运行 Workflow（产出 *_final.yaml）
sasiki refine <workflow_id>

# 3) 连接已有浏览器试运行
sasiki refine <workflow_id> --cdp-url http://localhost:9222

# 4) 非交互式模式（用于自动化/CI）
sasiki refine <workflow_id> --no-interactive --on-hitl=abort

# 5) 运行 HITL/Retry 相关测试
PYTHONPATH=src uv run --with pytest --with pytest-asyncio pytest tests/engine/test_human_interface.py tests/engine/test_cli_handler.py tests/engine/test_replay_agent_retry.py -v
```

---

## 已知未解决问题

- `click.triggers_navigation` 目前依赖短时间窗口，慢网络下可能误判。
  方向：改为事后关联或可配置窗口。

---

## 后续里程碑（简版）

- **Phase 2**：~~生成可校验的 Skill YAML（含变量、步骤、target_hint）~~ ✅ 已完成。后续持续优化：null 值过滤、click+navigate 合并、描述生成改进（详见 `docs/WORKFLOW_IMPROVEMENT_PLAN.md`）。
- **Phase 3**：完成执行引擎首版并在多站点达成稳定执行。
- **Phase 4**：补齐失败重试、人工介入、CLI 管理与体验优化。
