# Checklist: prompt_reasoning_observability

- [x] 设计文档已创建（Problem / Boundary / Options / Migration / Test）
- [x] 升级 system prompt（身份+能力+自适应执行循环）
- [x] 增加 `llm.thinkingLevel` 配置解析
- [x] 接入 `Agent.setThinkingLevel(...)`
- [x] 采集 assistant 回合（含 thinking/text/toolCalls）
- [x] 落盘 `assistant_turns.json`
- [x] 运行 typecheck
- [x] 运行 build
- [x] 更新 PROGRESS.md
