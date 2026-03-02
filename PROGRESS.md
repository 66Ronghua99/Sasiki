# Sasiki - 精简进度看板

**最后更新：2026-03-02** (Phase 2 正式完成，进入持续优化迭代；Phase 3 核心开发中)

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
| Phase 3 执行引擎     | 🟢 进行中 | 已完成 Replay Engine 设计，Playwright 环境管理与 CDP DOM 观测器、Replay Agent 雏形实现完成 |

---

## 已完成（近期关键项）

### Phase 3 执行引擎（新启动）

- 编写 `docs/PHASE3_REPLAY_DESIGN.md` 确定执行引擎架构与观测、执行双重策略。
- 引入 `playwright` 依赖，作为自动化执行基础。
- 实现 `PlaywrightEnvironment` (支持 CDP 连接或指定独立 `user_data_dir` 保留登录态)。
- 实现 `SessionManager`，支持通过 JSON 文件（如 EditThisCookie 导出）动态注入 Cookie 以绕过单点登录限制。
- 实现 `AccessibilityObserver`，通过 CDP 获取 `Accessibility.getFullAXTree` 并高比例压缩生成适合 LLM 阅读的树状 `live_dom_snapshot.json`。
- 实现 `ReplayAgent` 及 `AgentAction` Pydantic 模型，连通 LLM 推理与 Playwright `mouse.click` / `keyboard.type` 坐标级精准执行。
- 打通 DashScope (MiniMax-M2.5) 与 OpenRouter 的灵活切换。

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

1. **P0：构建 `WorkflowReplayer` 核心调度器**（支持 YAML 解析与分阶段任务执行）
2. **P0：优化 Agent Memory 与 Prompt Cache**（提升连续动作执行的稳定性和 LLM 响应速度）
3. **P1：Phase 1 E2E 稳定性补齐**（至少覆盖 3 个真实站点场景）

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
- [ ] 构建 `WorkflowRefiner` 读取 YAML 并拆分 Stage 执行。
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
