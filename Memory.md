# Sasiki 项目经验教训

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
