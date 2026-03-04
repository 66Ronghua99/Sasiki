# Checklist: watch_once_v0

- [x] 设计文档已创建（Problem / Boundary / Options / Migration / Test）
- [x] 记录用户已确认的范围决策（单标签、非敏感站点、多站点验证）
- [ ] 冻结 `demonstration_trace` schema（v0）
- [ ] 新增 `observe` 模式入口（不影响默认 run）
- [ ] 接入单标签页交互采集并落盘 `demonstration_raw.jsonl`
- [ ] 实现 trace 归一化并落盘 `demonstration_trace.json`
- [ ] 生成 `sop_draft.md` 与 `sop_asset.json`
- [ ] `sop_asset` 包含自然语言执行指引与 Web element 辅助信息（失败兜底）
- [ ] 增加本地 SOP 资产索引与检索入口
- [ ] 完成 Baidu / Douyin-or-TikTok / Xiaohongshu 三站点示教验证
- [ ] 运行 typecheck
- [ ] 运行 build
- [ ] 更新 PROGRESS.md（DONE/TODO 与 reference）
