# Sasiki - 精简进度看板

**最后更新：2026-02-28**

## 当前主线

仅维护 **browser-first** 路线：  
Chrome Extension 录制 -> Python 服务接入 -> Skill 生成 -> Playwright 执行。  
屏幕录制路线已下线。

---

## 当前状态（快照）

| 阶段 | 状态 | 结果 |
|---|---|---|
| Phase 1 录制链路 | ✅ 已完成 | Extension + WebSocket + JSONL 落盘已打通 |
| Phase 1 真实场景验收 | 🔄 进行中 | 需持续补充站点级 E2E 验证 |
| Phase 2 Skill 生成 | 🟡 准备中 | 事件合并、变量提取、YAML 输出待实现 |
| Phase 3 执行引擎 | ⏳ 未开始 | 候选匹配 + LLM 决策 + Playwright |

---

## 已完成（近期关键项）

- 录制链路闭环：`sasiki server start` + `sasiki record` 可用。
- 录制事件结构化落盘（JSONL，首行 metadata，后续 action）。
- 修复 content script 启动不稳定（注入校验 + 初始化延迟 + 重试）。
- 修复 SPA 点击漏录（原生交互元素识别 + fallback 指纹创建）。
- 支持 contenteditable 输入录制（含 keyup 兜底）。
- 修复输入冗余与时序问题（统一 pending 管理 + 强制 flush）。
- 滚动事件优化为 `scroll_load`（只记录内容加载相关滚动）。

---

## 当前优先级（按顺序）

1. **P0：Phase 1 E2E 稳定性补齐**（至少覆盖 3 个真实站点场景）
2. **P1：启动 Phase 2 Skill 生成**（事件合并 + 变量提取 + YAML）
3. **P1：确定元素匹配评分与阈值**（为执行引擎做准备）

---

## 本周执行项

- [ ] 完成 1 条标准化录制验收任务（推荐小红书搜索流程）
- [ ] 增加录制结果自动检查脚本（事件分布/字段完整性/时序）
- [ ] 协议补齐 `scroll_load` 相关字段（服务端模型对齐）
- [ ] 明确 Phase 2 输入输出契约（event stream -> skill yaml）

---

## 快速验证命令

```bash
# 1) 启动服务
sasiki server start

# 2) 开始录制
sasiki record --name "e2e_verify"

# 3) 查看录制结果
cat ~/.sasiki/recordings/browser/e2e_verify.jsonl

# 4) 运行现有 E2E 测试
PYTHONPATH=src uv run --with pytest --with pytest-asyncio --with websockets pytest -q tests/test_phase1_websocket_flow.py
```

---

## 已知未解决问题

- `click.triggers_navigation` 目前依赖短时间窗口，慢网络下可能误判。  
  方向：改为事后关联或可配置窗口。

---

## 后续里程碑（简版）

- **Phase 2**：生成可校验的 Skill YAML（含变量、步骤、target_hint）。
- **Phase 3**：完成执行引擎首版并在多站点达成稳定执行。
- **Phase 4**：补齐失败重试、人工介入、CLI 管理与体验优化。
