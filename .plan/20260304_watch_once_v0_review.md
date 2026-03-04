# Watch-Once v0 设计评估与实施就绪度分析

**Review Date**: 2026-03-04
**Review Scope**: Watch-Once v0 设计文档 + 代码实现就绪度
**Assessor**: Claude Code

---

## Executive Summary

| 维度 | 评估结果 |
|------|----------|
| 设计完整度 | ✅ 高（7-Step Migration Plan，全覆盖Problem/Boundary/Options/Test/Risk） |
| 边界清晰度 | ✅ 高（单标签页、6动作类型、4输出工件、非敏感站点） |
| 与现有系统耦合 | ✅ 低（`--mode observe`隔离，不破坏`run`模式） |
| 回滚点设计 | ✅ 充分（每个Step有独立Rollback point） |
| 代码就绪度 | ⚠️ 中等（基础设施已有，需新增4个文件+CLI扩展） |
| **闭环可能性** | ✅ **高** |

**建议**: Watch-Once v0 具备高闭环可能性，设计已就绪，可进入实施阶段。

---

## 1. 设计文档评估

### 1.1 设计完整性检查

| 章节 | 状态 | 关键内容 |
|------|------|----------|
| Problem Statement | ✅ | 明确当前runtime无法学习用户SOP，阻塞战略目标 |
| Constraints | ✅ | 保持run模式兼容、最小架构变更、单标签页V0 |
| Non-goals (V0) | ✅ | 明确排除多标签、安全脱敏、企业协作、自动优化器 |
| Boundary & Ownership | ✅ | 清晰的模块边界定义（7个模块） |
| Dependency Direction | ✅ | 单向依赖：infrastructure → core → domain → runtime |
| Single Source of Truth | ✅ | demonstration_trace.json 为canonical格式 |
| Demonstration Trace Definition | ✅ | 4个工件定义 + schema示例 + 6个动作类型 |
| Options & Tradeoffs | ✅ | 每个决策点提供2-3个选项及拒绝理由 |
| Migration Plan | ✅ | 7个Step，每个都有Rollback point |
| Test Strategy | ✅ | 单元/集成/手动E2E三层覆盖 |
| Risks & Mitigation | ✅ | 3个主要风险及缓解措施 |

### 1.2 核心设计决策回顾

**输出模型** (Option A - Chosen)
- Structured trace first + readable SOP draft
- 拒绝纯自然语言SOP（确定性弱）和视频主工件（存储重）

**采集策略** (Option A - Chosen)
- Playwright-level事件捕获 + 注入监听器
- 拒绝Full CDP低层流（V0复杂度高）

**Scope策略** (Option A - Chosen)
- 严格单标签页V0
- 拒绝多标签（边界情况多，延迟交付）

---

## 2. 代码就绪度评估

### 2.1 已有基础（可复用）

| 模块 | 文件路径 | 就绪状态 | 复用方式 |
|------|----------|----------|----------|
| CDP Browser Launcher | `infrastructure/browser/cdp-browser-launcher.ts` | ✅ 就绪 | observe模式直接调用启动浏览器 |
| Cookie Injection | `infrastructure/browser/cookie-loader.ts` | ✅ 就绪 | observe模式下可选注入 |
| Artifacts Writer | `runtime/artifacts-writer.ts` | ⚠️ 需扩展 | 新增writeDemonstrationRaw/Trace/Draft/Asset |
| Runtime Config | `runtime/runtime-config.ts` | ⚠️ 需扩展 | 新增`demonstration`配置段 |
| Agent Runtime | `runtime/agent-runtime.ts` | ⚠️ 需扩展 | 新增`observe(taskHint)`方法 |
| CLI Entry | `index.ts` | ⚠️ 需扩展 | 新增`--mode observe`参数解析 |

### 2.2 需新增实现

按设计文档2.1 Module Ownership，需创建以下文件：

```
apps/agent-runtime/src/
├── domain/
│   └── sop-trace.ts                    # Trace schema定义 (v0)
├── core/
│   └── sop-demonstration-recorder.ts   # 事件归一化
├── infrastructure/browser/
│   └── cdp-demonstration-recorder.ts   # 原始事件捕获
└── runtime/
    └── sop-asset-store.ts              # 资产索引与检索
```

### 2.3 关键接口对齐检查

**ArtifactsWriter扩展需求**:
```typescript
// 需新增方法
async writeDemonstrationRaw(events: DemonstrationRawEvent[]): Promise<void>
async writeDemonstrationTrace(trace: DemonstrationTrace): Promise<void>
async writeSopDraft(markdown: string): Promise<void>
async writeSopAsset(asset: SopAsset): Promise<void>
```

**RuntimeConfig扩展需求**:
```typescript
// 需新增配置段
demonstration?: {
  capture?: boolean;
  maxDurationMs?: number;
  outputDir?: string;  // 默认 ~/.sasiki/sop_assets/
}
```

---

## 3. Review Decisions（已冻结）

源自设计文档第8节：

| # | 问题 | 建议方案 | 影响 |
|---|------|----------|------|
| 1 | **站点B验证对象** | 抖音或 TikTok（二选一，按可访问性择一） | 决定V0验证用例之一 |
| 2 | **SOP资产存储路径** | `~/.sasiki/sop_assets/`（已冻结） | 影响sop-asset-store实现 |
| 3 | **V0验收严格度** | 必须可消费：资产需包含自然语言指引 + Web element辅助信息 | 决定Step 6实现范围 |

---

## 4. 实施Checklist当前状态

源自 `.plan/checklist_watch_once_v0.md`：

- [x] 设计文档已创建（Problem / Boundary / Options / Migration / Test）
- [x] 记录用户已确认的范围决策（单标签、非敏感站点、多站点验证）
- [ ] 冻结 demonstration_trace schema（v0）
- [ ] 新增 observe 模式入口（不影响默认 run）
- [ ] 接入单标签页交互采集并落盘 demonstration_raw.jsonl
- [ ] 实现 trace 归一化并落盘 demonstration_trace.json
- [ ] 生成 sop_draft.md 与 sop_asset.json
- [ ] 增加本地 SOP 资产索引与检索入口
- [ ] 完成 Baidu / E-commerce / Xiaohongshu 三站点示教验证
- [ ] 运行 typecheck
- [ ] 运行 build
- [ ] 更新 PROGRESS.md（DONE/TODO 与 reference）

**已完成**: 2/13
**待实施**: 11/13

---

## 5. Risk Assessment

| 风险 | 等级 | 描述 | 缓解措施 |
|------|------|------|----------|
| 多站点DOM差异 | 低 | 不同站点DOM结构差异可能导致trace质量不一致 | 限定6个动作类型，显式schema版本控制 |
| 敏感数据泄露 | 低 | 用户演示时可能输入敏感信息 | 严格非敏感站点策略（Baidu/Amazon/Xiaohongshu公开流） |
| 与现有run模式冲突 | 低 | 新observe模式可能影响现有功能 | `--mode`参数隔离，默认保持run模式 |
| 索引增长无保留期 | 低 | 长期运行后sop_assets目录可能膨胀 | V1增加手动prune命令（已记录于设计文档） |

**总体风险**: 🟢 低风险 - 设计已充分考虑风险缓解

---

## 6. 实施建议

### 6.1 前置确认（已完成）
1. 站点B验证对象：抖音或 TikTok（二选一）
2. SOP资产存储路径：`~/.sasiki/sop_assets/`
3. V0必须实现Agent消费路径（含自然语言指引 + Web element辅助）

### 6.2 实施顺序（参考Migration Plan）

**Phase 1: Schema冻结** (15分钟)
- Step 1: 创建 `domain/sop-trace.ts` 和 `domain/sop-asset.ts`
- 定义DemonstrationTrace、DemonstrationStep、SopAsset类型

**Phase 2: CLI扩展** (15分钟)
- Step 2: 扩展 `index.ts` 支持 `--mode observe`
- 扩展 `runtime-config.ts` 支持demonstration配置
- 扩展 `agent-runtime.ts` 添加 `observe()` 方法

**Phase 3: 采集实现** (30分钟)
- Step 3: 实现 `cdp-demonstration-recorder.ts` 原始事件捕获
- Step 4: 实现 `sop-demonstration-recorder.ts` 事件归一化

**Phase 4: 工件生成** (20分钟)
- Step 5: 扩展 `artifacts-writer.ts`，实现 `sop-asset-store.ts`
- 生成4个工件：raw.jsonl / trace.json / draft.md / asset.json

**Phase 5: Agent消费** (必做，20分钟)
- Step 6: 实现SOP asset加载和agent上下文转换
- 增加自然语言指引输出与 Web element 辅助字段产出

**Phase 6: 验证** (30分钟)
- Step 7: Baidu / Douyin-or-TikTok / Xiaohongshu 三站点手动验证

**预计总工时**: 1.5 ~ 2 小时

### 6.3 质量门禁

实施完成后必须运行：
```bash
npm --prefix apps/agent-runtime run typecheck
npm --prefix apps/agent-runtime run build
```

---

## 7. 结论

**Watch-Once v0 具备高闭环可能性**，理由如下：

1. **设计文档完整**: 7-Step Migration Plan，每个Step有明确产出和Rollback point
2. **边界控制得当**: 单标签页、6动作类型、4输出工件，范围可控
3. **与现有系统解耦**: `--mode observe`不破坏`run`模式，风险低
4. **基础设施就绪**: 70%依赖已存在（CDP启动、ArtifactsWriter、Config系统）
5. **风险可控**: 所有识别风险均有缓解措施，无阻塞性问题

**状态**: 🟢 **Ready for Implementation**

---

## Appendix: Reference Files

| 文件 | 路径 | 用途 |
|------|------|------|
| 设计文档 | `.plan/20260304_watch_once_v0_design.md` | 完整设计决策与Migration Plan |
| Checklist | `.plan/checklist_watch_once_v0.md` | 实施进度追踪 |
| 本Review | `.plan/20260304_watch_once_v0_review.md` | 评估结论与建议 |
