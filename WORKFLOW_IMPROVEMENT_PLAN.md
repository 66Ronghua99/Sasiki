# Workflow 生成改进规划

**记录日期**: 2026-03-01
**背景**: 基于 xhs_e2e.jsonl 端到端测试结果分析

---

## 问题 1: Null 值浪费 Context

### 现状
`action_details` 中存在大量 null 字段：
```yaml
target_hint:
  class_name: null
  element_id: null
  name: ''
  parent_role: null
  placeholder: null
  role: generic
  sibling_texts: []
  tag_name: svg
  test_id: null
value: null
url: null
triggers_navigation: null
```

### 影响
- 浪费 LLM context window
- 降低可读性
- 增加存储开销

### 解决方案
**方案 A: 写入时过滤 (推荐)**
```python
# 在保存前递归移除 null/空值
def remove_nulls(obj):
    if isinstance(obj, dict):
        return {k: remove_nulls(v) for k, v in obj.items()
                if v is not None and v != "" and v != []}
    elif isinstance(obj, list):
        return [remove_nulls(item) for item in obj if item is not None]
    return obj
```

**方案 B: Pydantic 序列化控制**
```python
class ActionDetail(BaseModel):
    class Config:
        exclude_none = True  # Pydantic V2
```

**方案 C: 自定义 YAML 编码器**
- 在写入 YAML/JSON 时跳过 null 字段

### 实施位置
- `skill_generator.py` 中的 `_build_stage_from_action_ids()` 方法
- `storage.py` 中的 `save()` 方法

---

## 问题 2: 事件识别不准确（特别是 icon/div 点击）

### 现状案例
**录制**: 点击收藏按钮（实际点击点是 `svg`）
```yaml
action_type: click
target_hint:
  role: generic
  tag_name: svg
  name: ''
  sibling_texts: ['2398']  # 点赞数
```

**生成描述**: `Click on https://...`

### 核心问题
- 只记录“点击点”，没有区分“原始点击节点”和“可执行目标节点”。
- 不能只依赖 `closest(button/a)`：`svg/div` 本身也可能绑定 click（关闭浮层、委托事件等）。
- 缺少可解释证据链（祖先语义、候选评分），导致后续 LLM/执行器不稳定。

### 新方案（已验证方向）

**方案 A（P0，推荐）：双轨目标**
- 保留任意 click（不丢行为）；
- 同时记录两类信息：
  - `raw_target_hint`: 原始点击节点（真实点击点）；
  - `normalized_target_hint`: 基于候选评分选择的“动作目标”。

```yaml
action_type: click
target_hint: <normalized_target_hint>
raw_target_hint: {tag_name: svg, ...}
normalized_target_hint: {tag_name: button, name: 收藏, ...}
```

**方案 B（P1）：语义标签补充而不是硬推断**
- 基于 `target_hint + raw_target_hint + sibling_texts` 给出 `semantic_candidates`；
- 仅在低置信度时让 LLM裁决，不让 LLM 作为唯一语义来源。

**方案 C（P2）：视觉辅助（可选）**
- 对低置信度 icon 点击截图，再用多模态识别。

### 为什么不是“只找最近父 button/a”
- 会误伤“任意区域点击关闭弹层”这类真实行为；
- 会丢失 `svg/div` 自身 click 语义（尤其事件委托场景）；
- replay 时不一定能还原用户真正的操作意图。

### 推荐实施
**短期 (P0)**: 方案 A（双轨目标）  
**中期 (P1)**: 方案 B（语义候选 + 条件化 LLM 推断）

---

## 问题 3: Click 与 Navigate 关系不明显

### 现状案例
```yaml
# Action 5
action_type: click
target_hint: {role: link, name: "6774ab0a000000000800fca4"}

# Action 6
action_type: navigate
url: "https://www.xiaohongshu.com/explore/6774ab0a000000000800fca4..."
triggered_by: click
```

**生成描述**:
- "Click \"6774ab0a000000000800fca4\""
- "Navigate to \"https://www.xiaohongshu.com/explore/...\""

### 问题
- Click 和 Navigate 被分成两个独立动作
- 用户感知的是"点击链接打开页面"一个动作
- "click on [url]" 描述没有说明点击的是什么元素

### 解决方案

**方案 A: 合并 Click+Navigate (推荐)**
```yaml
# 合并前
actions:
  - Click "笔记链接"
  - Navigate to "笔记详情页"

# 合并后
actions:
  - Click "笔记链接" and navigate to "笔记详情页"

action_details:
  - action_type: click_navigate  # 新类型
    click_target:
      role: link
      name: 6774ab0a...
      text: "我的2024年度穿搭18图"  # 需要提取
    navigate_to: "https://..."
```

**方案 B: 改进 Actions 描述生成**
```python
# 改进 _format_action_text() 方法
def _format_action_text(self, action_detail):
    action_type = action_detail.get("action_type")
    target_hint = action_detail.get("target_hint") or {}
    page_context = action_detail.get("page_context", {})

    if action_type == "click":
        # 区分不同类型的 click
        if target_hint.get("role") == "link":
            # 尝试从 sibling_texts 提取链接文本
            siblings = target_hint.get("sibling_texts", [])
            link_text = self._extract_link_text(siblings)
            return f'Click link "{link_text}"'

        elif target_hint.get("tag_name") == "svg":
            # 推断图标类型
            icon_type = self._infer_icon_type(target_hint, page_context)
            return f'Click {icon_type} button'

        elif target_hint.get("role") == "textbox":
            return f'Click input field "{target_hint.get("name")}"'

    elif action_type == "navigate":
        # 如果 triggered_by 是 click，可以简化或合并
        if action_detail.get("triggered_by") == "click":
            return None  # 返回 None 表示不单独显示
        return f'Navigate to "{self._simplify_url(action_detail.get("url"))}"'
```

**方案 C: 多步拆分解析 (更复杂的方案)**
```yaml
# 将用户操作拆分为更细粒度的意图层
semantic_actions:
  - type: "select_search_result"
    description: "选择搜索结果中的第一个笔记"
    raw_actions: [5, 6]  # 对应的原始 action_ids
    elements:
      - type: "search_result_card"
        title: "我的2024年度穿搭18图"
        author: "neeee"
    expected_result: "打开笔记详情页"
```

### 推荐实施
**P0**: 方案 A - 合并 click+navigate
- 在 `_build_stage_from_action_ids()` 中检测 `triggered_by: click` 的 navigate
- 与前一个 click 合并为一个复合动作

**P1**: 方案 B - 改进描述生成
- 增强 `_format_action_text()`，区分 link/svg/input 等类型
- 从 sibling_texts 提取可读文本

---

## 实施优先级

| 优先级 | 问题 | 方案 | 影响面 |
|--------|------|------|--------|
| P0 | Click+Navigate 合并 | 方案 A | Skill Generator |
| P0 | Null 值过滤 | 方案 A | Storage / Skill Generator |
| P1 | 描述生成改进 | 方案 B | Skill Generator |
| P1 | Extension 语义提取 | 方案 A | Extension Content Script |
| P2 | LLM 语义推断 | 方案 B | Skill Generator (Prompt) |
| P3 | 视觉辅助 | 方案 C | 架构扩展 |

---

## 下一步行动

1. **立即实施 (本周)**
   - [ ] 实现 null 值过滤
   - [ ] 实现 click+navigate 合并
   - [ ] 改进 actions 描述生成

2. **短期优化 (下周)**
   - [ ] 扩展 Extension 的 target_hint 提取
   - [ ] 添加语义推断 prompt
   - [ ] 更新测试用例

3. **验证方式**
   - 重新生成 xhs_e2e workflow
   - 检查 action_details 体积减少
   - 验证 actions 描述可读性
   - 确认 click+navigate 已合并

---

## 参考文件

- `src/sasiki/workflow/skill_generator.py` - 核心生成逻辑
- `src/sasiki/workflow/recording_parser.py` - 解析逻辑
- `extension/content_script.js` - 录制逻辑
- `src/sasiki/server/websocket_protocol.py` - Action 模型
