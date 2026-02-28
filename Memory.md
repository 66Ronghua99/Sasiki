# Sasiki 项目经验教训

## 2026-02-28 contenteditable 元素输入录制问题

### 问题描述
在 Gemini、Notion 等网站录制用户输入时，`type` 事件无法记录。用户输入了文本但录制文件中只有 `click` 事件。

### 根本原因
1. **元素类型不匹配**: 这些网站使用 `contenteditable` div (`<div role="textbox" contenteditable="true">`) 而不是原生 `<input>` 或 `<textarea>`
2. **input 事件监听器过于严格**: 原 `inputListener` 将 `e.target` 强制转换为 `HTMLInputElement`，忽略了 `contenteditable` 元素
3. **值提取方式错误**: 原 `recordInputAction` 使用 `target.value` 获取输入值，但 `contenteditable` div 需要使用 `target.textContent`
4. **事件触发问题**: 某些 `contenteditable` 元素可能不触发标准的 `input` 事件，需要额外的 `keyup` 监听

### 解决方案
1. **扩展输入元素检测** (`content.ts`)
   - 检测 `contenteditable` 属性: `target.isContentEditable`
   - 同时监听 `input` 和 `keyup` 事件

2. **统一值提取逻辑**
   ```typescript
   let value: string;
   if (tag === 'input' || tag === 'textarea' || tag === 'select') {
       value = (target as HTMLInputElement).value;
   } else if (target.isContentEditable) {
       value = target.textContent || '';
   }
   ```

3. **类型定义更新**
   - `PendingActions.input.target`: `HTMLInputElement | null` → `HTMLElement | null`
   - `recordInputAction` 参数: `HTMLInputElement` → `HTMLElement`

### 关键代码变更
```typescript
// content.ts: 支持 contenteditable
const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;

// 同时监听 keyup 以确保 contenteditable 可靠触发
document.addEventListener('input', inputListener, true);
document.addEventListener('keyup', inputListener, true);
```

---

## 2026-02-27 SPA 页面点击录制问题

### 问题描述
在小红书等 SPA 网站录制用户操作时，点击笔记卡片无法记录 `click` 事件。

### 根本原因
1. **AX Tree 与点击目标不同步**: 小红书是动态加载内容的 SPA，当用户点击笔记卡片时，`<a>` 元素可能不在预计算的 AX Tree 中
2. **原生链接未被识别**: 小红书使用 `<a href="...">` 作为链接，但没有 `role="link"` 或 `tabindex` 属性，原检测逻辑只检查 ARIA role
3. **AX Tree 检测过于严格**: 原来的 `isInteractiveElement` 只检测 ARIA role、tabindex 或 onclick，忽略了原生 HTML 标签的语义

### 解决方案
1. **扩展交互式元素检测** (`axtree.ts`)
   - 添加原生 HTML 标签检测：`<a>`(有href)、`<button>`、`<input>`、`<textarea>`、`<select>`
   - 为原生元素分配对应的 ARIA role

2. **添加 fallback 录制机制** (`content.ts`)
   - 当 `getRefIdForElement` 返回 `undefined` 时，向上遍历 DOM 查找交互式父元素
   - 使用 `createFingerprintFromElement` 直接从 Element 创建 fingerprint，不依赖预计算的 refId

3. **关键代码变更**
   ```typescript
   // axtree.ts: 扩展交互式元素检测
   const isNativeLink = tag === 'a' && element.hasAttribute('href');
   const isNativeButton = tag === 'button';
   const isNativeInput = tag === 'input' || tag === 'textarea' || tag === 'select';
   const isNativeInteractive = isNativeLink || isNativeButton || isNativeInput;

   // content.ts: fallback 录制
   if (refId) {
       // 使用预计算的 AX Tree
   } else {
       // 实时创建 fingerprint
       const fingerprint = axTreeManager.createFingerprintFromElement(element);
   }
   ```

### 后续优化方向
1. **AX Tree 动态更新**: 考虑监听 DOM 变化，实时更新 AX Tree
2. **更智能的元素检测**: 检测 CSS cursor 属性、常用 class name 模式等
3. **记录所有点击**: 考虑记录所有点击并事后分析，而不是依赖预检测

### 调试技巧
- 在 `clickListener` 中添加日志检查元素的 `tagName`、`role`、`tabindex`
- 检查 `axTreeManager.elementToRefId` 的大小和内容
- 确认 content script 已重新加载（刷新页面）

---

## 2026-02-28 input 事件录制缺失 value 问题

### 问题描述
在录制登录表单时，手机号和验证码输入框的内容没有被记录，录制文件中 `type` 事件的 `value` 字段始终为 `null`。

### 根本原因分析
1. **录制流程差异**：
   - click 事件有 fallback 机制（当 refId 不存在时，查找交互式父元素并直接创建 fingerprint）
   - input 事件只有主路径，没有 fallback 机制

2. **AX Tree 依赖问题**：
   - `getRefIdForElement` 依赖 `elementToRefId` WeakMap
   - 这个 map 只有在调用 `captureTree`/`captureCompactTree` 等方法时才会填充
   - 录制模式**没有预先生成** AX Tree

3. **为什么 click 能工作**：
   - click 事件第 128-188 行实现了 fallback：当 refId 不存在时，向上遍历 DOM 查找交互式父元素
   - 找到后直接调用 `createFingerprintFromElement` 创建 fingerprint

### 解决方案
为 input 事件添加 fallback 模式：
```typescript
if (refId) {
    // 原有逻辑
} else {
    // Fallback: 直接为 input 元素创建 fingerprint
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        const fingerprint = axTreeManager.createFingerprintFromElement(target);
        recordAction({...});
    }
}
```

### 为什么不需要预生成 AX Tree
- 预生成需要 MutationObserver 监听所有 DOM 变化，性能开销大
- click 事件的 fallback 方案已证明可行
- 按需 fallback 更轻量，适合录制场景

### 相关代码位置
- `content.ts` 第 194-217 行：input 事件监听
- `content.ts` 第 128-188 行：click 事件 fallback 参考实现
- `axtree.ts` 第 287-325 行：`createFingerprintFromElement` 方法

---

## 2026-02-28 录制事件时序和冗余问题修复

### 问题描述
1. **Input 事件冗余**: 500ms debounce 太短，用户输入 "hello" 被记录了 4 次中间状态（"h", "he", "hel", "hello"）
2. **事件时序错乱**: 快速提交时（输入后立即点击/按Enter），input 事件可能在 click 之后发送，导致回放时序错误
3. **Scroll 事件跨页面**: 滚动中点击链接导航，scroll 事件可能在导航后才记录

### 根本原因
- Debounce 时间过短，用户正常打字停顿就会触发记录
- 没有强制 flush 机制确保 pending 事件在关键操作前发送
- Input、scroll、click 各自管理 timeout，没有统一协调

### 解决方案
采用「统一 pending 管理 + 强制 flush」机制：

1. **延长 input debounce**: 500ms → 2000ms，只记录用户真正停顿后的最终结果
2. **添加强制 flush 触发器**:
   - `blur` - 用户离开输入框
   - `Enter` 键 - 表单提交
   - `click` 事件开头 - 确保 input 在 click 之前记录
3. **统一 pending 管理**: 使用 `PendingActions` 接口集中管理所有 pending 状态

### 关键代码结构
```typescript
interface PendingActions {
    input: { timeout: number | null; target: HTMLInputElement | null };
    scroll: { timeout: number | null };
}

function flushAllPendingActions() {
    // Flush input: clear timeout + record immediately
    // Flush scroll: clear timeout + check content loading
}
```

### 实现要点
- Click 监听器开头必须调用 `flushAllPendingActions()`
- Input debounce 延长至 2000ms 减少中间状态
- Scroll 检测也纳入统一 pending 管理
- Detach listeners 时清理所有 pending timeouts

### 验证方法
1. 缓慢输入 "hello"（每字母间隔 <2秒）- 应只记录 1 次 type 事件
2. 快速输入 "test" 后立即按 Enter - type 事件应在 navigate 之前
3. 滚动后立即点击链接 - scroll 事件应在 click/navigate 之前

---

## 2026-02-27 区分点击触发导航 vs 真实页面跳转

### 问题背景
录制小红书时，点击笔记卡片触发 SPA 伪导航（URL 变化但实际是弹窗覆盖层），会同时记录 `click` + `navigate` 两个独立事件。回放时执行 navigate 会导致错误的页面跳转。

### 解决方案
通过标记区分导航类型：
- `navigate.triggered_by`: `'click' | 'url_change' | 'redirect'`
- `navigate.is_same_tab`: 是否在同 tab 内
- `click.triggers_navigation`: 点击是否触发了导航

### 实现要点
1. 使用 `recentClick` 状态跟踪最近一次点击
2. MutationObserver 检测 URL 变化时，检查时间窗口内是否有点击
3. 延迟记录点击事件（250ms），检查是否发生了导航
