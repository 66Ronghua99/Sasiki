# Sasiki - 项目进度追踪

## 当前主线（唯一）

**日期：2026-02-27**

Sasiki 当前仅维护 **浏览器自动化（browser-first）** 路线。

- 主目标：录制浏览器操作并生成可执行 Skill
- 执行方式：规则筛选 + LLM 文本决策 + Playwright
- 参考实现重点：`src/sasiki/browser/extension/`（本项目浏览器能力建设核心实现）

> 屏幕录制路线已下线：不再维护，不再作为当前 roadmap 的一部分。

---

## 架构（当前）

```
Chrome Extension（录制）
  -> Python Agent Service（事件接入 / Skill 生成）
  -> Agent Runtime（候选匹配 / LLM 决策 / Playwright 执行）
```

### 核心设计决策

| 问题 | 决策 |
|------|------|
| 元素定位 | 使用元素指纹（role/name/tag/context），不依赖固定 ref_id |
| 匹配策略 | 先规则筛选候选，再由 LLM 在候选集中做文本决策 |
| 动态列表 | 保存内容关键词 + 局部上下文，运行时重定位 |
| Skill 形态 | 自然语言步骤 + `target_hint`（元素指纹提示） |

示例：

```yaml
steps:
  - description: "在搜索框输入关键词"
    action: type
    target_hint:
      role: textbox
      name_contains: "搜索"
      tagName: INPUT
      context:
        parent_role: search
        sibling_texts: ["热门搜索"]
    variable: keyword
```

---

## 里程碑与完成标准

### Phase 1: Extension 录制链路 ✅ COMPLETED
- [x] 复用 `src/sasiki/browser/extension/axtree.ts` 并实现 `getElementFingerprint()`
- [x] 录制模式：监听 click/type/select/navigation
- [x] Background 与 Python 建立 WebSocket 双向通道

**新增文件：**
- `src/sasiki/server/websocket_protocol.py` - 协议定义 (ActionType, ElementFingerprint, RecordedAction, WSMessage)
- `src/sasiki/server/websocket_server.py` - WebSocket 服务端 (RecordingSession, WebSocketServer)
- `src/sasiki/server/__init__.py` - 模块导出

**修改文件：**
- `src/sasiki/browser/extension/axtree.ts` - 添加 getElementFingerprint() 和 getRefIdForElement() 方法
- `src/sasiki/browser/extension/content.ts` - 添加录制状态管理和事件监听器
- `src/sasiki/browser/extension/background.ts` - 重写为 WebSocket 通信，添加跨页面录制支持
- `src/sasiki/cli.py` - 添加 `record` 和 `server` 命令
- `pyproject.toml` - 添加 websockets 依赖

**Extension 配置文件：**
- `src/sasiki/browser/extension/manifest.json` - Manifest V3 配置
- `src/sasiki/browser/extension/package.json` - npm 构建配置
- `src/sasiki/browser/extension/tsconfig.json` - TypeScript 配置
- `src/sasiki/browser/extension/webpack.config.js` - 打包配置
- `src/sasiki/browser/extension/popup.html` / `popup.js` - 扩展弹出界面

**DoD**
- [ ] 可完整录制 >= 20 步真实浏览器操作
- [x] 每步均生成结构化事件（含 target_hint）
- [x] 录制文件可被后端成功消费（100% 通过）
- [x] 智能滚动录制实现（TypeScript 编译通过）

**修复记录（2026-02-27）**
- [x] 修复 SPA 页面（小红书）点击录制失败问题
  - 问题：`<a>` 标签没有 ARIA role 时不被识别为交互式元素
  - 解决：扩展交互式元素检测，支持原生 HTML 标签（`<a>`、`<button>`、`<input>` 等）
  - 解决：添加 fallback 录制机制，当 refId 不存在时直接创建元素 fingerprint
- [x] 添加导航类型标记，区分点击触发导航 vs 真实页面跳转
  - `click.triggers_navigation`: 是否触发导航
  - `navigate.triggered_by`: 导航来源（click/url_change/redirect）
  - `navigate.is_same_tab`: 是否同 tab 导航

**优化记录（2026-02-28）**
- [x] 智能滚动录制：从"全量记录"改为"按需录制"
  - 背景：当前会记录所有 scroll 事件，但项目不使用视觉能力，滚动位置对精准定位无用
  - 方案：移除普通 scroll 监听，改为检测"滚动意图 + 内容变化"
  - 只记录触发内容加载的滚动（如无限滚动场景），事件类型改为 `scroll_load`
  - 减少录制文件体积，回放更稳定，语义更清晰
  - 实现细节：
    - 监听 `wheel` / `touchmove` 检测滚动意图（500ms debounce）
    - 滚动停止后检查 `scrollHeight` 变化（>100px 阈值）或子元素数量增加
    - 区分 `infinite_scroll`（新增多个元素）和 `lazy_load`（高度增加）
    - 记录内容加载提示（如 "Added 5 items" 或 "Height increased by 300px"）
  - 修改文件：`src/sasiki/browser/extension/content.ts`

- [x] 修复录制事件时序和冗余问题
  - 问题 1: Input 事件冗余 - 500ms debounce 太短，导致 "h" -> "he" -> "hel" -> "hello" 多次记录
  - 问题 2: 事件时序错乱 - 快速提交时 input 事件可能在 click 之后发送
  - 问题 3: Scroll 事件可能在导航后才记录
  - 解决方案：采用「统一 pending 管理 + 强制 flush」机制
    - Input debounce: 500ms -> 2000ms，减少中间状态记录
    - 添加强制 flush 触发器：blur / Enter / click 前强制发送 pending input
    - 统一 pending 管理：集中管理 input 和 scroll 的 pending 状态
    - Click 事件开头调用 `flushAllPendingActions()` 确保时序正确
  - 修改文件：`src/sasiki/browser/extension/content.ts`
  - 关键变更：
    - 新增 `PendingActions` 接口统一管理 pending 状态
    - 新增 `flushAllPendingActions()` 函数强制发送所有 pending 事件
    - 新增 `recordInputAction()` 函数提取 input 记录逻辑
    - 添加 blur 和 keypress (Enter) 监听器作为强制 flush 触发器

- [x] 支持 contenteditable 元素输入录制 (Gemini、Notion 等)
  - 问题：现代 Web 应用使用 `contenteditable` div 代替原生 input，导致输入无法记录
  - 触发场景：Gemini (`<div role="textbox" contenteditable="true">`)、Notion、Google Docs 等
  - 解决方案：
    - 扩展输入元素检测：同时检查 `tag === 'input'` 和 `target.isContentEditable`
    - 统一值提取逻辑：原生 input 用 `.value`，contenteditable 用 `.textContent`
    - 添加 `keyup` 事件监听作为 contenteditable 的备选触发机制
    - 更新类型定义：`HTMLElement` 替代 `HTMLInputElement`
  - 修改文件：`src/sasiki/browser/extension/content.ts` (inputListener, recordInputAction, PendingActions)

---

### Phase 2: Python Skill 生成
- [ ] WebSocket 服务接收并落盘事件流
- [ ] LLM 合并语义动作并提取变量
- [ ] 输出 Skill YAML（含变量、步骤、target_hint）

**DoD**
- [ ] 对 5 条示例任务均可生成有效 YAML
- [ ] YAML 可通过模型校验并可被运行时加载
- [ ] 变量提取准确率达到可用水平（人工评审通过）

---

### Phase 3: Agent 执行引擎
- [ ] Playwright + CDP 获取精简 DOM 上下文
- [ ] 规则匹配引擎（target_hint -> 候选集）
- [ ] LLM 文本决策模块（候选选择 + action args）

**DoD**
- [ ] 在 3 个站点上端到端执行成功率 >= 85%
- [ ] 元素定位失败可触发重试并输出诊断日志
- [ ] 单步执行日志可追溯（输入、候选、决策、动作）

---

### Phase 4: 稳定性与体验
- [ ] Skill 管理 CLI（list/show/edit/run）
- [ ] 失败重试与人工介入机制
- [ ] 动态列表与分页场景优化

**DoD**
- [ ] 失败场景可人工接管并继续执行
- [ ] 常见站点列表任务成功率持续提升

---

## browser-use 参考强调

`src/sasiki/browser/extension/` 是当前阶段最重要的实现资产：

- `src/sasiki/browser/extension/axtree.ts`：可访问性树与元素语义提取
- `src/sasiki/browser/extension/content.ts`：页面侧事件与元素信息采集（新增录制模式）
- `src/sasiki/browser/extension/background.ts`：扩展后台通信骨架（WebSocket 版本）
- `src/sasiki/browser/extension/sidebar.ts`：交互入口/录制 UI 参考
- `src/sasiki/browser/extension/popup.html` / `popup.js`：扩展弹出界面

原则：**优先复用和改造，不重复造轮子**。

---

## 代码清理状态（旧路线退场）

### 已完成
- [x] 移除屏幕录制 CLI 命令（`record` / `analyze`）
- [x] 移除 `src/sasiki/recorder/`
- [x] 移除 `src/sasiki/analyzer/`
- [x] 移除与旧录制链路绑定的图像处理模块 `src/sasiki/utils/image.py`
- [x] 清理对应导出与依赖（`utils/__init__.py`, `pyproject.toml`）

### 待完成
- [x] 替换/新增浏览器录制入口命令（Phase 1 已完成）
- [ ] 增加 browser-first 端到端测试

---

## 当前阻塞与优先级

1. **P0**：Phase 1 端到端测试验证 (录制 >= 20 步真实操作)
2. **P1**：确定元素指纹匹配评分与阈值
3. **P1**：沉淀 LLM 决策提示词模板与评测集

---

## 已知问题与待办

### 录制逻辑
- [x] **input 事件 value 为 null** ✅ FIXED (2026-02-28)
  - 问题：`type` 事件（用户输入）的 `value` 字段始终为 null
  - 根本原因：`getRefIdForElement` 依赖预计算的 AX Tree，但录制模式没有预生成树
  - 解决方案：为 input 事件添加 fallback 机制（参考 click 事件的实现）
  - 修改文件：`src/sasiki/browser/extension/content.ts` 第 194-217 行
  - 状态：代码已修改，extension 已重新构建，待验证

- [ ] **延迟导航标记失效**（低优先级）
  - 问题：当前 `click.triggers_navigation` 依赖 250ms 延迟检测，如果导航发生在延迟之后（>250ms），会误判为 `false`
  - 触发场景：慢网络、SPA 数据预加载、过渡动画等
  - 现象：click 先记录为 `triggersNavigation: false`，随后 navigate 记录 `triggeredBy: 'click'`
  - 解决方向：事后标记机制（根据时间戳重新关联）或延长检测窗口
  - 备注：当前优先处理稳定网络场景，此问题在快网络环境下不影响使用

---

## Phase 1 使用说明

### 1. 安装 Python 依赖

```bash
cd /Users/cory/codes/Sasiki
uv sync
```

### 2. 构建 Extension

```bash
cd src/sasiki/browser/extension
npm install
npm run build
```

### 3. 加载 Extension

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `src/sasiki/browser/extension/` 目录

### 4. 启动录制

```bash
# 终端 1：启动 WebSocket 服务器
PYTHONPATH=src uv run --with websockets python -m sasiki.cli server start

# 终端 2：开始录制
PYTHONPATH=src uv run --with websockets python -m sasiki.cli record --name "xhs-e2e-01"
```

### 5. 小红书 10 步手测任务（推荐）

在 Chrome 中打开小红书并执行以下步骤（尽量每步间隔 1-2 秒）：
1. 访问 `https://www.xiaohongshu.com`
2. 点击顶部搜索框
3. 输入 `通勤穿搭 春季`
4. 按 `Enter` 触发搜索
5. 在结果页点击「最热」或「最新」筛选
6. 滚动页面约 2-3 屏
7. 点击一条笔记卡片进入详情
8. 在详情页再滚动 1-2 屏
9. 点击浏览器后退返回搜索结果页
10. 点击另一条笔记卡片进入详情页

### 6. 停止录制

在终端 2 中按 `Ctrl+C`，录制文件将保存到 `~/.sasiki/recordings/browser/<session_id>.jsonl`

### 7. 验证录制结果

```bash
cat ~/.sasiki/recordings/browser/xhs-e2e-01.jsonl
```

### 8. 运行自动化端到端测试

```bash
PYTHONPATH=src uv run --with pytest --with pytest-asyncio --with websockets pytest -q tests/test_phase1_websocket_flow.py
```
