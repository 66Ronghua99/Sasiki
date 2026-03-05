# Checklist: watch_once_pr3_phase2_semantic_layer

- [x] 设计文档已创建（Problem / Boundary / Options / Migration / AC / Test）
- [x] semantic mode 配置接入（off|auto|on）
- [x] CLI 参数 `--semantic` 接入
- [x] `SemanticCompactor` 实现并接线
- [x] fallback 机制生效（失败不阻塞 compact 产物）
- [x] `guide_semantic.md` 产物与 metadata 标记落盘
- [x] AC-1 ~ AC-4 手动验收通过（`run_id=20260305_134516_980`，`auto` 成功生成 `guide_semantic.md`）
- [x] typecheck 通过
- [x] build 通过
- [x] PROGRESS / NEXT_STEP / MEMORY 同步更新
