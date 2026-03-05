# Checklist: watch_once_pr3_semantic_compaction_consumption

- [x] 设计文档已创建（Problem / Boundary / Options / Migration / Test）
- [x] Phase-1: `sop-compact` 规则降噪升级完成
- [x] Phase-1: `webElementHints` 保留 selector/text/role 并去重
- [x] Phase-1: 手动验收通过（多 tab + 高层步骤可复盘）
- [ ] Phase-2: 可选 LLM 语义增强接入（off|auto|on）
- [ ] Phase-2: 语义增强失败回退 rule-based 输出
- [ ] Phase-3: run 路径接入 SOP 资产检索与上下文注入
- [ ] Phase-3: 资产消费日志可追踪（asset_id/guide_source/fallback）
- [x] typecheck 通过
- [x] build 通过
- [x] PROGRESS / NEXT_STEP / MEMORY 同步更新
