# E2E 测试点击失败分析报告

**Workflow ID**: `60b002bc-a4c5-4695-9496-a1d9c7f4bc94`
**测试目标**: 小红书 (xiaohongshu.com) 搜索+互动流程
**分析日期**: 2026-03-03
**报告状态**: 🔴 阻断性 Bug - 需优先修复

---

## 1. 执行摘要

E2E 测试在 **"First Post Interaction"** Stage 连续失败，核心问题是**Agent 无法正确定位和点击小红书文章页面的交互元素**。经过 9 次尝试后用户手动中止。

### 失败时间线

```
Stage 1: Initial Search and Navigation ✅ SUCCESS (5 steps)
Stage 2: First Post Interaction         ❌ FAILED (9 steps, aborted)
Stage 3-6: Skipped (dependency failure)
```

---

## 2. 失败详情分析

### 2.1 失败模式矩阵

| Step | Action | Target | 错误类型 | 根本原因 |
|------|--------|--------|----------|----------|
| 3 | click | `link '早春就让男朋友这样穿...'` | `Timeout 5000ms` | 遮罩层拦截 |
| 4 | click | `generic 'like-wrapper'` | `Timeout 30000ms` | 元素不存在 |
| 6 | click | `link '早春就让男朋友这样穿...'` | `Timeout 5000ms` | 遮罩层拦截 |
| 7 | click | `generic 'note-detail-mask'` | `Timeout 30000ms` | 元素不存在 |
| 9 | click | `button '喜欢'` | `Timeout 5000ms` | `get_by_text` 失败 |
| 10 | click | `textbox '说点什么...'` | `Timeout 30000ms` | 元素不存在/不可见 |

### 2.2 关键错误日志

#### 错误模式 A: 遮罩层拦截 (Step 3, 6)

```
locator resolved to <span data-v-51ec0135="">早春就让男朋友这样穿...</span>
attempting click action
  - element is visible, enabled and stable
  - scrolling into view if needed
  - done scrolling
  - <div class="note-detail-mask" note-id="6979dfba...">...</div> intercepts pointer events
```

**技术分析**: Playwright 的标准 `click()` 会检查元素是否被其他元素遮挡。小红书的 `note-detail-mask` 是一个全屏遮罩层，覆盖了文章标题，阻止了点击事件传递。

#### 错误模式 B: 元素不存在 (Step 4, 7)

```
Retry execution failed: Locator.click: Timeout 30000ms exceeded.
  - waiting for get_by_role("generic", name="like-wrapper")
```

**技术分析**: `like-wrapper` 和 `note-detail-mask` 在 Agent 可见的 DOM Snapshot 中不存在。这表明：
1. DOM 提取逻辑未能捕获这些元素
2. 或者这些元素的 role/name 属性与预期不符

#### 错误模式 C: 文本定位失败 (Step 9, 10)

```
Retry execution failed: Locator.click: Timeout 5000ms exceeded.
  - waiting for get_by_text("喜欢").first
```

**技术分析**: 即使使用 `get_by_text` fallback，仍然找不到元素。查看 snapshot 发现文章页的交互元素（点赞、评论按钮）根本没有出现在提取的列表中。

---

## 3. 根因分析

### 3.1 一级根因: DOM 元素提取不完整

**问题位置**: `src/sasiki/engine/execution_strategy.py:606-668`

当前 `_extract_interactive_elements()` 的实现缺陷：

```python
elements = await page.evaluate("""
    () => {
        const interactive = [];
        const roles = ['button', 'link', 'textbox', ...];  // 有限的 role 列表

        roles.forEach(role => {
            document.querySelectorAll(`[role="${role}"], ${role}`)...
        });

        // 只查找显式 role 属性，不处理隐式 role
        // 不处理 SVG 图标按钮
        // 不处理自定义组件
    }
""")
```

**具体缺陷**:
1. **Role 白名单过窄**: 未包含 `generic`, `img`, `article` 等小红书实际使用的 role
2. **选择器过于简单**: 只查找 `[role="xxx"]` 或标签名，不处理 ARIA 隐式 role
3. **缺乏深度遍历**: 只搜索 document，不搜索 shadow DOM
4. **可见性判断不准确**: `el.offsetParent !== null` 在复杂布局中可能误判

### 3.2 二级根因: 定位策略过于严格

**问题位置**: `src/sasiki/engine/replay_agent.py:396-412`

当前 `_click_with_fallback` 的 fallback 逻辑：

```python
async def _click_with_fallback(self, page: Page, locator: Any, action: AgentDecision) -> None:
    try:
        await locator.click()  # 策略1: get_by_role
        return
    except Exception:
        if ...:
            raise

    fallback_name = action.target.name.strip()
    await page.get_by_text(fallback_name, exact=False).first.click(timeout=5000)  # 策略2
```

**问题**:
1. **只有两级回退**: role → text，缺少更多策略（如 CSS selector、坐标点击）
2. **exact=False 不够宽松**: 小红书标题可能包含 emoji、空格差异
3. **没有遮罩层处理**: 遇到 `pointer-events` 拦截时没有关闭遮罩的逻辑

### 3.3 三级根因: Agent Prompt 缺乏上下文

**问题位置**: `src/sasiki/engine/replay_agent.py:14-36`

System Prompt 中虽然提到了"Handling dynamic pages"，但没有明确指导 Agent 如何处理：
1. 遮罩层/弹窗关闭
2. 元素在视口外时需要滚动
3. 当首选定位失败时如何尝试替代方案

---

## 4. 数据验证

### 4.1 Snapshot 对比分析

| 页面 | URL | 提取到的交互元素数 | 实际可见交互元素数 |
|------|-----|-------------------|-------------------|
| 搜索结果页 | `/search_result?keyword=...` | 97 | ~20+ 文章卡片 |
| 文章详情页 | `/explore/6979dfba...` | 142 | ~10+ 点赞/评论/分享按钮 |

**观察**:
- 数字看起来很高，但检查具体内容发现大部分是无意义的 footer 链接
- 真正需要的交互元素（点赞按钮、评论输入框）未被正确识别

### 4.2 DOM 结构分析（来自 agent_view_snapshot_after_click.json）

文章页实际存在的交互元素示例：

```json
{
  "role": "link",
  "name": "早春就让男朋友这样穿，少年感满满*8⃣️",
  // ❌ 这是搜索结果的链接，不是文章页的点赞按钮
}
```

**问题确认**: Snapshot 显示文章页的交互元素提取仍然停留在**搜索结果页的结构**，没有正确反映文章详情页的实际可交互元素。

---

## 5. 修复方案

### 方案 A: 增强 DOM 提取（推荐）

**修改文件**: `src/sasiki/engine/execution_strategy.py`

```python
async def _extract_interactive_elements(self, page: Page) -> list[dict[str, Any]]:
    """增强版交互元素提取 - 针对小红书等 SPA 优化"""

    elements = await page.evaluate("""
        () => {
            const interactive = [];

            // 1. 扩展 role 白名单
            const roles = [
                'button', 'link', 'textbox', 'searchbox',
                'checkbox', 'radio', 'combobox', 'generic',
                'img', 'article', 'section', 'navigation'
            ];

            // 2. 处理显式 role + 隐式 role (ARIA)
            const allElements = document.querySelectorAll('*');
            allElements.forEach(el => {
                const role = el.getAttribute('role') ||
                           el.tagName.toLowerCase();

                // 3. 多源 name 提取
                const name = (
                    el.getAttribute('aria-label') ||
                    el.getAttribute('aria-labelledby') ||
                    el.getAttribute('title') ||
                    el.getAttribute('alt') ||
                    el.textContent?.trim()?.substring(0, 100) ||
                    el.getAttribute('data-text') ||  // 小红书常用
                    el.getAttribute('data-note-id') ||  // 小红书文章 ID
                    ''
                );

                // 4. 更准确的可见性检测
                const rect = el.getBoundingClientRect();
                const isVisible = rect.width > 0 &&
                                rect.height > 0 &&
                                rect.top < window.innerHeight &&
                                rect.bottom > 0;

                // 5. 检查是否是交互元素
                const isInteractive =
                    roles.includes(role) ||
                    el.onclick !== null ||
                    el.tagName === 'BUTTON' ||
                    el.tagName === 'A' ||
                    el.getAttribute('tabindex') === '0';

                if (isVisible && isInteractive && name) {
                    interactive.push({
                        role: role,
                        name: name,
                        tag: el.tagName?.toLowerCase(),
                        class: el.className,
                        rect: {  // 添加位置信息用于滚动
                            top: rect.top,
                            left: rect.left,
                            width: rect.width,
                            height: rect.height
                        }
                    });
                }
            });

            return interactive;
        }
    """)

    return elements
```

### 方案 B: 增强点击策略

**修改文件**: `src/sasiki/engine/replay_agent.py`

```python
async def _click_with_fallback(self, page: Page, locator: Any, action: AgentDecision) -> None:
    """增强点击回退策略"""

    # 策略1: 标准 role+name 点击
    try:
        await locator.click()
        return
    except Exception as e:
        error_msg = str(e).lower()

    # 策略2: 处理遮罩层拦截
    if 'intercepts pointer events' in error_msg:
        # 尝试按 Escape 关闭遮罩层
        await page.keyboard.press('Escape')
        await asyncio.sleep(0.5)
        try:
            await locator.click()
            return
        except:
            pass

    # 策略3: 使用 JavaScript 强制点击（绕过遮罩）
    try:
        await locator.evaluate('el => el.click()')
        return
    except:
        pass

    # 策略4: text fallback（模糊匹配）
    if action.target and action.target.name:
        fallback_name = action.target.name.strip()
        # 移除 emoji 和特殊字符进行模糊匹配
        clean_name = re.sub(r'[^\w\s]', '', fallback_name)

        for text_pattern in [fallback_name, clean_name]:
            if not text_pattern:
                continue
            try:
                await page.get_by_text(text_pattern, exact=False).first.click(timeout=3000)
                return
            except:
                pass

    # 策略5: 坐标点击（最后手段）
    if action.target_id and action.target_id in self.current_node_map:
        node_info = self.current_node_map[action.target_id]
        if node_info.rect:
            x = node_info.rect.left + node_info.rect.width / 2
            y = node_info.rect.top + node_info.rect.height / 2
            await page.mouse.click(x, y)
            return

    raise ClickFailedException(f"All click strategies failed for {action.target}")
```

### 方案 C: 添加自动滚动

在执行点击前检查元素是否在视口内：

```python
async def _ensure_in_viewport(self, page: Page, locator: Any) -> None:
    """确保元素在视口内，如不在则滚动"""
    try:
        await locator.scroll_into_view_if_needed()
        await asyncio.sleep(0.3)  # 等待滚动完成
    except:
        pass  # 某些元素可能不支持滚动
```

### 方案 D: 更新 Agent Prompt

在 System Prompt 中添加专门的章节：

```markdown
## Handling Overlays and Modals
- If you see 'intercepts pointer events' error, try pressing Escape first
- Look for close buttons (X icon, '关闭', '取消') to dismiss overlays
- If an element is expected but missing, try scrolling down first

## Element Fallback Strategy
If primary target fails:
1. Try different role (e.g., button instead of generic)
2. Try partial text match without emoji/special chars
3. Look for parent container or sibling elements
4. Use ask_human as last resort
```

---

## 6. 优先级与实施计划

| 优先级 | 方案 | 预估工作量 | 影响范围 |
|--------|------|-----------|----------|
| P0 | 方案 A (DOM 提取增强) | 2-3h | 所有 E2E 测试 |
| P0 | 方案 B (点击回退) | 2h | 所有 E2E 测试 |
| P1 | 方案 C (自动滚动) | 1h | 所有 E2E 测试 |
| P2 | 方案 D (Prompt 更新) | 30min | Agent 决策质量 |

---

## 7. 测试验证

修复后需要验证的场景：

1. **小红书文章页**
   - [ ] 能正确提取点赞/收藏/评论按钮
   - [ ] 能成功点击被遮罩的文章标题
   - [ ] 能找到并点击评论输入框

2. **其他网站（回归测试）**
   - [ ] 百度搜索流程
   - [ ] GitHub 操作
   - [ ] 知乎浏览流程

---

## 8. 附录

### 相关文件

- `src/sasiki/engine/execution_strategy.py` - DOM 提取和策略执行
- `src/sasiki/engine/replay_agent.py` - Agent 决策和动作执行
- `src/sasiki/engine/page_observer.py` - 页面观测

### 参考 Snapshot

- `agent_view_snapshot.json` - 搜索结果页 snapshot
- `agent_view_snapshot_after_click.json` - 点击后文章页 snapshot

### 执行报告

- `~/.sasiki/workflows/60b002bc-a4c5-4695-9496-a1d9c7f4bc94/execution_report_final.json`

---

**报告编制**: Claude Code
**审核状态**: 待技术评审
