# Sasiki 端到端测试报告

**测试时间**: 2026-03-01
**测试文件**: `/Users/cory/.sasiki/recordings/browser/xhs_e2e.jsonl`
**测试场景**: 小红书搜索并浏览笔记
**Workflow ID**: `15126d7e-241f-46f4-80bf-4d2ca0195fd8`

---

## 1. 测试执行摘要

### 1.1 命令执行结果

| 命令 | 结果 | 耗时 |
|------|------|------|
| `generate --preview` | ✅ 成功 | ~2s |
| `generate` (LLM生成) | ✅ 成功 | ~27s |
| `show <workflow_id>` | ✅ 成功 | ~1s |
| `run --dry-run` | ⚠️ 需要交互输入 | N/A |

### 1.2 录制数据概览

- **Session ID**: `xhs_e2e`
- **录制时长**: 95.1s
- **总动作数**: 18
- **选中动作数**: 18 (未截断)
- **页面分组**: 6 个不同 URL

### 1.3 生成的 Workflow 概览

- **Workflow 名称**: 小红书搜索测试
- **Stages**: 4 个阶段
- **Variables**: 4 个变量 (1个必需)
- **Checkpoints**: 3 个检查点

---

## 2. 详细分析

### 2.1 阶段划分 (Stages) 分析

| 阶段 | 名称 | 动作数 | 评价 |
|------|------|--------|------|
| 1 | 搜索关键词 | 4 | ✅ 逻辑清晰 |
| 2 | 浏览第一个笔记 | 5 | ⚠️ 包含返回动作，边界模糊 |
| 3 | 浏览第二个笔记 | 5 | ⚠️ 同样包含返回动作 |
| 4 | 返回首页 | 4 | ⚠️ 包含无关的 tab_switch |

**问题发现**:
- Stage 2 和 3 的返回搜索结果页动作被包含在同一阶段内，阶段边界不够清晰
- Stage 4 包含了一个 `tab_switch` 到 `chrome://extensions/`，这是录制结束时切换回扩展页面的动作，不应包含在工作流中

### 2.2 动作保留分析

**成功保留的关键字段**:
```
✅ page_context: 18/18 (100%)
✅ target_hint_raw: 9/18 (50%)
✅ DOM context (class/id/testid/sibling): 5/18 (28%)
```

**动作详情示例** (Stage 1 - 搜索关键词):

| # | 动作类型 | target_hint | 评价 |
|---|----------|-------------|------|
| 1 | navigate | - | ✅ 保留完整 URL |
| 2 | click | role=textbox, name=搜索小红书, tag=input | ✅ 语义清晰 |
| 3 | type | role=textbox, name=搜索小红书, value=通勤穿搭 春季 | ✅ 包含输入值 |
| 4 | navigate | - | ✅ 搜索结果页 URL |

### 2.3 变量提取分析

| 变量名 | 类型 | 必需 | 示例值 | 评价 |
|--------|------|------|--------|------|
| search_keyword | text | ✅ | 通勤穿搭 春季 | ✅ 正确识别关键输入 |
| initial_search_term | text | ❌ | 深信服x-star面试 | ⚠️ 初始页面 URL 中的关键词，实用性低 |
| first_note_url | url | ❌ | .../6774ab0a... | ⚠️ 硬编码 URL，执行时可能失效 |
| second_note_url | url | ❌ | .../68aeb6aa... | ⚠️ 同上 |

**问题发现**:
1. `initial_search_term` 实用性较低，因为初始页面是录制时的状态，不应作为可配置变量
2. 笔记 URL 变量是硬编码的，实际执行时应该动态获取搜索结果中的链接

### 2.4 Checkpoint 分析

| 位置 | 描述 | 评价 |
|------|------|------|
| After Stage 1 | 验证搜索结果页面正常加载并显示相关内容 | ✅ 合理 |
| After Stage 2 | 验证第一个笔记内容页面正常显示 | ✅ 合理 |
| After Stage 3 | 验证第二个笔记内容页面正常显示 | ✅ 合理 |

Checkpoints 设置合理，但缺少具体的验证标准（`expected_state` 为 null）。

### 2.5 问题动作识别

#### 问题 1: 点击动作的 target_hint 不够精确

```yaml
# Action 5 - 执行搜索后的点击
action_type: click
target_hint:
  role: generic
  tag_name: span
  name: ''
```
**问题**: 这个点击动作的 target_hint 只有 `role=generic, tag_name=span`，没有更具体的标识（如 class、id、或文本内容）。这会导致执行引擎难以准确定位元素。

#### 问题 2: 返回动作识别混乱

录制中用户点击了返回按钮，但系统记录为:
```yaml
# Action 8 - 应该是返回搜索结果页
action_type: click
target_hint:
  role: generic
  tag_name: div
  sibling_texts: ["window.__SSR__=true", "创作服务直播管理电脑直播助手", ...]
```
**问题**: sibling_texts 包含了页面底部的 footer 内容，而不是返回按钮的标识。这表明 target_hint 的提取可能需要改进。

#### 问题 3: 包含无关动作

```yaml
# Action 18 - 最后一个动作
action_type: tab_switch
page_context:
  url: chrome://extensions/
  title: Extensions
```
**问题**: 这是录制结束时切换回扩展页面的动作，不应包含在工作流中。需要添加过滤逻辑排除浏览器内部页面动作。

---

## 3. 代码结构问题

### 3.1 `action_details` vs `actions` 重复

Workflow YAML 中同时保留了:
- `actions`: 人类可读的文本描述列表
- `action_details`: 详细的结构化动作数据

这导致数据冗余，文件体积增大。

### 3.2 URL 编码问题

```yaml
# 录制中的 URL 被 URL-encoded 了两次
url: https://www.xiaohongshu.com/search_result/?keyword=%25E6%25B7%25B1...
# 实际应该是:
url: https://www.xiaohongshu.com/search_result/?keyword=深信服x-star面试
```

**问题**: URL 显示为 double-encoded 格式（`%25E6` 应该是 `%E6`），影响可读性。

### 3.3 变量与动作关联不足

虽然提取了 `search_keyword` 变量，但在 `action_details` 中并没有明确的占位符或模板标记来指示这个变量应该替换哪个动作的值。

---

## 4. 改进建议

### 4.1 高优先级 (P0)

1. **过滤无关动作**
   - 排除 `chrome://` 和 `edge://` 等浏览器内部页面动作
   - 排除录制开始/结束的 tab_switch 动作

2. **改进 target_hint 提取**
   - 对于返回按钮等常见 UI 元素，增强识别逻辑
   - 考虑使用视觉位置信息作为辅助定位手段

3. **修复 URL 显示**
   - 确保 URL 只进行一次 decode，提高可读性

### 4.2 中优先级 (P1)

4. **阶段边界优化**
   - 在阶段划分时识别 "返回" 类型的 navigate 动作
   - 将 "浏览笔记 -> 返回搜索结果" 拆分为两个独立阶段

5. **变量模板化**
   - 在 `action_details` 中添加变量引用标记
   - 例如: `value: "{{search_keyword}}"` 而不是硬编码值

6. **减少冗余数据**
   - 考虑只保留 `action_details`，动态生成 `actions` 描述

### 4.3 低优先级 (P2)

7. **Checkpoint 增强**
   - 基于页面内容自动生成 `expected_state`
   - 例如：搜索结果页应包含 "搜索结果" 关键字

8. **元素定位策略优化**
   - 当 `target_hint` 信息不足时，考虑使用 CSS selector 或 XPath 作为 fallback

---

## 5. 结论

### 5.1 整体评价

| 维度 | 评分 | 说明 |
|------|------|------|
| 录制完整性 | ⭐⭐⭐⭐⭐ | 所有关键动作都被正确记录 |
| 阶段划分 | ⭐⭐⭐☆☆ | 基本合理，但边界需要优化 |
| 变量提取 | ⭐⭐⭐⭐☆ | 识别了关键变量，但有冗余 |
| 可执行性 | ⭐⭐☆☆☆ | 部分 target_hint 不足以支撑可靠回放 |

### 5.2 当前状态

**Phase 2 Skill 生成已基本可用**，能够:
- ✅ 正确解析录制文件
- ✅ 提取语义化的 workflow 结构
- ✅ 识别关键变量
- ✅ 生成可保存/查看的 workflow YAML

**但存在以下阻碍执行的问题**:
- ⚠️ 部分动作 target_hint 信息不足
- ⚠️ 包含录制相关的无关动作
- ⚠️ 变量未与动作关联（模板化）

### 5.3 下一步建议

1. **短期**: 修复 P0 问题，使 workflow 可用于 Phase 3 执行引擎测试
2. **中期**: 优化 target_hint 提取逻辑，提高元素定位成功率
3. **长期**: 结合执行反馈持续优化 Prompt 和阶段划分算法

---

## 附录: 原始录制动作序列

```
1. navigate  -> 搜索页(深信服x-star面试)
2. click     -> 搜索框
3. type      -> "通勤穿搭 春季"
4. navigate  -> 搜索结果页
5. click     -> span (执行搜索)
6. click     -> 第一个笔记链接
7. navigate  -> 笔记详情页
8. click     -> div (返回按钮)
9. navigate  -> 返回搜索结果页
10. click    -> 第二个笔记链接
11. navigate -> 笔记详情页
12. click    -> svg (点赞按钮)
13. click    -> div (返回按钮)
14. navigate -> 返回搜索结果页
15. navigate -> 原搜索页
16. click    -> "发现" 导航
17. navigate -> 发现页
18. tab_switch -> chrome://extensions/
```
