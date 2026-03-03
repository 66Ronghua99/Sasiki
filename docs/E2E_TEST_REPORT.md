> [!NOTE]
> **活跃文档** | 最后更新：2026-03-03
> Phase 3 AI-Native 重构已完成，本文档已从「历史分析报告」升级为「E2E 测试指南」。
> 涵盖：环境搭建 → 录制数据 → 生成 Workflow → 执行验证 → 故障排查。

# 小红书 E2E 测试指南

**适用阶段**: Phase 3 执行引擎（WorkflowRefiner）  
**测试目标**: 在真实小红书网站上验证 Agent Loop 的端到端执行稳定性与准确率

---

## 1. 测试概览

### 1.1 可用录制数据

| 录制文件 | 录制日期 | 时长 | 动作数 | 测试场景 | 状态 |
|----------|----------|------|--------|----------|------|
| `xhs_e2e.jsonl` | 2026-02-28 | 95s | 18 | 搜索"通勤穿搭 春季"，浏览两篇笔记后返回首页 | ✅ 可用 |
| `xhs_e2e2.md.jsonl` | 2026-03-01 | 54s | 17 | 搜索"春季穿搭 男"，点赞、排序过滤、收藏操作 | ✅ 可用（推荐）|
| `xhs-e2e-01.jsonl` | 2026-02-27 | 62s | 0 | — | ❌ 录制失败（0 动作）|

### 1.2 已生成 Workflow

| Workflow ID | 名称 | 来源录制 | Stages | 有 final? |
|-------------|------|----------|--------|-----------|
| `15126d7e` | 小红书搜索测试 | `xhs_e2e` | 4 | ❌ |
| `95553d90` | Xiaohongshu Fashion Search | `xhs_e2e2.md` | 5 | ❌ |
| `60b002bc` | xhs_e2e2 | `xhs_e2e2.md` | 5 | ✅ `workflow_final.yaml` 已产出 |

**推荐优先使用** `60b002bc`（已有 final workflow，来自最新录制，交互更丰富）。

---

## 2. 环境准备

### 2.1 必要条件

```bash
# 确认 Python 环境与依赖
cd /Users/cory/codes/Sasiki
uv run sasiki --help

# 确认 Cookie 文件存在（用于绕过小红书登录）
ls ~/.sasiki/cookies/
# 应包含从 Chrome 导出的 xiaohongshu cookie JSON
```

### 2.2 启动带 CDP 的 Chrome

```bash
# 方式一：用独立 user_data_dir（推荐，避免锁冲突）
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/sasiki-chrome-test \
  --no-first-run \
  --no-default-browser-check \
  "https://www.xiaohongshu.com"

# 方式二：连接已有 Chrome（需先开启远程调试）
# 确认 Chrome 已启动并监听 9222
curl -s http://localhost:9222/json | python3 -m json.tool | grep url | head -5
```

### 2.3 登录状态验证

小红书对未登录用户有严格限制，执行前须确认：

```bash
# 手动验证：打开 Chrome，访问 https://www.xiaohongshu.com
# 确认右上角显示用户头像（而非"登录"按钮）
# 若未登录，通过 SessionManager 注入 Cookie：
# Cookie JSON 可用 EditThisCookie 浏览器扩展从已登录 Chrome 导出
```

---

## 3. 测试场景一：搜索"通勤穿搭 春季"并浏览笔记

**来源录制**: `~/.sasiki/recordings/browser/xhs_e2e.jsonl`  
**Workflow ID**: `15126d7e-241f-46f4-80bf-4d2ca0195fd8`

### 3.1 场景描述

```
阶段 1 搜索关键词  → navigate → click 搜索框 → type "通勤穿搭 春季" → navigate 搜索结果页
阶段 2 浏览第一个笔记 → click 笔记链接 → navigate 详情页 → click 返回
阶段 3 浏览第二个笔记 → click 笔记链接 → navigate 详情页 → click 点赞 → click 返回
阶段 4 返回首页    → navigate 发现页
```

### 3.2 执行命令

```bash
# Step 1: 重新生成 Workflow（可选，已有则跳过）
sasiki generate ~/.sasiki/recordings/browser/xhs_e2e.jsonl \
  --name "小红书搜索测试" \
  --description "搜索通勤穿搭并浏览笔记"

# Step 2: 查看 Workflow
sasiki show 15126d7e-241f-46f4-80bf-4d2ca0195fd8

# Step 3: 执行（连接已有 CDP Chrome）
sasiki refine 15126d7e-241f-46f4-80bf-4d2ca0195fd8 \
  --cdp-url http://localhost:9222

# Step 4: 非交互模式（CI/自动化）
sasiki refine 15126d7e-241f-46f4-80bf-4d2ca0195fd8 \
  --cdp-url http://localhost:9222 \
  --no-interactive \
  --on-hitl=abort
```

### 3.3 验收标准

| 阶段 | 成功条件 | 失败信号 |
|------|----------|----------|
| 搜索关键词 | URL 变为 `search_result?keyword=通勤穿搭` | DOM stagnation / 搜索框未找到 |
| 浏览第一篇笔记 | URL 含 `/explore/` 路径 | 点击后无导航 |
| 浏览第二篇笔记 | 笔记详情页加载完成 | element_not_found（笔记 ID 已变化）|
| 返回首页 | URL 含 `/explore?channel_id=homefeed` | 导航超时 |

---

## 4. 测试场景二：搜索"春季穿搭 男"，点赞 + 排序过滤（推荐）

**来源录制**: `~/.sasiki/recordings/browser/xhs_e2e2.md.jsonl`  
**Workflow ID**: `60b002bc-a4c5-4695-9496-a1d9c7f4bc94`（已有 `workflow_final.yaml`）

### 4.1 场景描述

```
阶段 1 Initial Search and Navigation    → 从已有搜索页清空并输入新关键词
阶段 2 First Post Interaction           → 点击第一篇笔记 → 点赞 → 查看作者主页
阶段 3 Filter and Browse Results        → 返回 → 点击"最多点赞"排序过滤
阶段 4 Second Post Interaction          → 点击热门笔记 → 收藏 → 查看作者主页
阶段 5 Return to Discovery Feed         → 点击"发现"导航 → 返回首页
```

### 4.2 执行命令

```bash
# 使用已有 final workflow 继续测试
sasiki show 60b002bc-a4c5-4695-9496-a1d9c7f4bc94

# 执行（连接 CDP Chrome）
sasiki refine 60b002bc-a4c5-4695-9496-a1d9c7f4bc94 \
  --cdp-url http://localhost:9222

# 或重新生成最新版本 Workflow
sasiki generate ~/.sasiki/recordings/browser/xhs_e2e2.md.jsonl \
  --name "小红书春季穿搭男" \
  --description "搜索春季穿搭男内容，点赞收藏互动"
```

### 4.3 变量覆盖

```bash
# 若支持变量注入（未来功能），可指定自定义搜索词：
# sasiki refine <workflow_id> --var search_query="夏季穿搭 男"
```

### 4.4 验收标准

| 阶段 | 成功条件 | 常见问题 |
|------|----------|----------|
| Initial Search | 搜索框清空并填入新词，URL 跳转至新结果页 | 初始页面 cookie 弹窗导致点击失败（见故障排查 5.1）|
| First Post Interaction | 笔记详情页加载，点赞数变化可见 | SPA 渲染延迟导致 DOM 为空（见 5.2）|
| Filter and Browse | 搜索结果页切换为"最多点赞"排序 | filter 按钮 role 为 generic，name 不稳定 |
| Second Post Interaction | 第二篇笔记详情页加载，收藏数可见 | 笔记内容因时效性变化，ID 可能过期 |
| Return to Discovery | URL 变为 `/explore?channel_id=homefeed_recommend` | — |

---

## 5. 故障排查指南

### 5.1 Cookie 弹窗 / 申诉提示遮挡内容

**症状**: Agent 第一步 click 失败，DOM snapshot 包含 `我要申诉我知道了` 文本  
**原因**: 小红书有时显示隐私提示或活动弹窗，遮挡搜索框  
**处置**:
1. 手动关闭弹窗后重新执行
2. 或在 `context_hints` 中加入提示：`"如果有弹窗出现，先关闭弹窗"`

### 5.2 DOM Snapshot 为空 / SPA 渲染延迟

**症状**: `observe()` 返回空树，Agent 决策 navigate 到原地址反复循环  
**原因**: 导航触发后 JS 框架尚未完成渲染（已知问题，见 Memory.md #11）  
**处置**: 已在 `execute_action` 中加入 `wait_for_load_state("networkidle")` 容错，若仍失败：
```bash
# 增大超时（修改 page_observer.py 或 replay_agent.py 中的 timeout 值）
```

### 5.3 笔记 ID 过期（element_not_found）

**症状**: `click on link 6774ab0a000000000800fca4` 失败  
**原因**: 录制中的笔记链接是硬编码 ID，小红书笔记可能下架  
**处置**: 这是 SPA 动态内容的固有风险。测试时关注 Stage 级别完成（是否成功浏览某篇笔记），而非特定笔记 ID  
**长期方案**: Phase B 时 Agent 应理解意图（浏览第一篇笔记），而非固定 ID

### 5.4 搜索结果页 URL double-encoded

**症状**: URL 显示为 `keyword=%25E6%25B7%25B1` 而非 `keyword=深信服`  
**原因**: 录制时 URL 被二次编码（已知问题，见 E2E_TEST_REPORT v1）  
**影响**: 不影响执行，Agent 通过 navigate action 使用完整 URL；不影响稳定性

### 5.5 DOM stagnation（dom_hash 连续不变）

**症状**: StageExecutor 返回 `DOM stagnation detected: dom_hash xxx unchanged for 3 steps`  
**原因**: Agent 反复选择同一操作，页面无变化  
**处置**:
1. 查看 episode_log 确认哪个元素被反复点击
2. 若是点击返回按钮问题：小红书返回按钮 role=generic，尝试用 `navigate` 替代 `click` 返回
3. 如确实卡住，HITL 介入后继续

---

## 6. 回归测试清单

每次 engine/prompt 改动后，执行以下检查：

- [ ] **Stage 1 搜索定位**：能否找到搜索框 (`role=searchbox, name=搜索小红书`) 并成功 fill
- [ ] **Page navigation 等待**：navigate 后 DOM snapshot 非空（SPA 渲染完成）
- [ ] **笔记链接点击**：`role=link` 笔记 ID 点击成功并跳转到 `/explore/` 路径
- [ ] **返回操作**：是否能通过 role+name 或 navigate 成功返回搜索结果页
- [ ] **done 声明质量**：evidence 字段包含具体页面状态（URL / 可见文本）
- [ ] **多 Stage 串联**：前一 Stage 的 world_state 是否正确传递给下一 Stage
- [ ] **单元测试**：`uv run pytest -q tests/` 全部通过（当前基线：190 tests）

---

## 7. 性能与成本基线

> 以下数据来自 2026-03-02 `xhs_e2e2` 场景的实际运行记录（参考值）

| 指标 | 参考值 | 备注 |
|------|--------|------|
| 单 Stage 平均步数 | 3–6 步 | 含 navigate + interact |
| 单步 LLM 调用耗时 | ~2–4s | DashScope / OpenRouter |
| 单 Stage 成功率 | ~70%（当前） | 目标 >90% |
| Retry 触发率 | ~30% | 主要因 element_not_found |
| 整体 Workflow 完成率 | ~50%（当前） | 目标 >80% |

---

## 附录 A：录制动作序列对比

### xhs_e2e（2026-02-28）— 18 动作

```
 1. navigate  → xiaohongshu.com/search_result（已有关键词页）
 2. click     → 搜索框（role=textbox, name=搜索小红书）
 3. type      → "通勤穿搭 春季"
 4. navigate  → 搜索结果页
 5. click     → span（执行搜索，role=generic）⚠️ target_hint 较弱
 6. click     → 第一篇笔记链接（role=link, name=6774ab0a...）
 7. navigate  → 笔记详情页
 8. click     → div（返回按钮）⚠️ role=generic
 9. navigate  → 返回搜索结果
10. click     → 第二篇笔记链接（role=link, name=68aeb6aa...）
11. navigate  → 笔记详情页
12. click     → svg（点赞按钮）⚠️ role=generic
13. click     → div（返回按钮）⚠️ role=generic
14. navigate  → 返回搜索结果
15. navigate  → 返回原搜索页
16. click     → 发现（role=link, name=发现）✅
17. navigate  → 发现页
18. tab_switch → chrome://extensions/  ← 应过滤
```

### xhs_e2e2.md（2026-03-01）— 17 动作（推荐）

```
 1. click     → header（搜索框区域入口，role=generic）
 2. type      → "春季穿搭 男"（role=textbox, name=搜索小红书）✅
 3. navigate  → 搜索结果页
 4. click     → 第一篇笔记（role=link）✅
 5. navigate  → 笔记详情页
 6. click     → 点赞（name=83，role=generic）
 7. click     → 作者主页滑动区域（role=generic）
 8. navigate  → 返回搜索结果
 9. click     → "最新"排序（role=generic, name=最新）
10. click     → "最多点赞"排序（role=generic, name=最多点赞）✅
11. click     → 第二篇笔记（role=link）✅
12. navigate  → 笔记详情页
13. click     → 收藏（name=1万，role=generic）
14. click     → 作者主页区域（role=generic）
15. navigate  → 返回搜索结果
16. click     → 发现（role=link, name=发现）✅
17. navigate  → 发现页
```

---

## 附录 B：Phase 2 分析归档（2026-03-01）

> 以下保留 Phase 2 Skill 生成阶段的主要发现，供历史参考。

**整体评价（Phase 2 完成时）**：
- 录制完整性 ⭐⭐⭐⭐⭐ — 关键动作均被正确记录
- 阶段划分 ⭐⭐⭐☆☆ — 基本合理，边界有改进空间
- 变量提取 ⭐⭐⭐⭐☆ — 识别了关键变量，有少量冗余
- 可执行性 ⭐⭐☆☆☆（Phase 2 结束时）→ ⭐⭐⭐☆☆（Phase 3 AI-Native 重构后）

**Phase 2 遗留问题（已在 AI-Native 重构中解决）**：
- ✅ role+name 语义寻址替代 node_id（AgentDecision 改造）
- ✅ EpisodeMemory 结构化步骤日志（避免 history 字符串 clear）
- ✅ StageVerifier evidence-based done（避免虚假完成声明）
- ⏳ 笔记链接 ID 硬编码问题 → Path B 意图理解方向
- ⏳ 返回按钮 target_hint 弱 → get_by_role fallback 改善中

