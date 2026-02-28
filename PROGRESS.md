# Sasiki - 项目进度追踪

## 当前主线（唯一）

**日期：2026-02-28**

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

---

### Phase 1 E2E 验证任务设计

**任务名称**: `xhs_search_and_browse` - 小红书搜索与浏览任务

**验证目标**: 确保录制链路在真实场景下稳定运行，为 Phase 2 提供可靠的输入数据

**操作序列**（13 步，预计 3-5 分钟）：

| 步骤 | 动作 | 验证点 |
|------|------|--------|
| 1 | 访问 `https://www.xiaohongshu.com` | navigate 事件 |
| 2 | 点击顶部搜索框 | click 事件，元素指纹 |
| 3 | 输入 `通勤穿搭 春季` | type 事件，中文输入 |
| 4 | 按 `Enter` 搜索 | keypress 触发导航 |
| 5 | 点击「最热」筛选 | click，SPA 动态内容 |
| 6 | 向下滚动 2-3 屏 | scroll_load 事件 |
| 7 | 点击第 1 条笔记 | click，triggersNavigation |
| 8 | 在详情页滚动 1 屏 | scroll_load（详情页）|
| 9 | 点击收藏按钮 | click（交互反馈）|
| 10 | 点击浏览器后退 | navigate，triggeredBy: 'click' |
| 11 | 点击第 2 条笔记 | click，返回后元素定位 |
| 12 | 在详情页滚动 | scroll_load |
| 13 | 点击返回首页/关闭 | navigate |

**验收标准**: 见下方"Phase 1 E2E 验收检查清单"

**执行脚本**: `scripts/test_e2e_xhs_search.sh`（待创建）

**修复记录（2026-02-27）**
- [x] 修复 SPA 页面（小红书）点击录制失败问题
  - 问题：`<a>` 标签没有 ARIA role 时不被识别为交互式元素
  - 解决：扩展交互式元素检测，支持原生 HTML 标签（`<a>`、`<button>`、`<input>` 等）
  - 解决：添加 fallback 录制机制，当 refId 不存在时直接创建元素 fingerprint
- [x] 添加导航类型标记，区分点击触发导航 vs 真实页面跳转
  - `click.triggers_navigation`: 是否触发导航
  - `navigate.triggered_by`: 导航来源（click/url_change/redirect）
  - `navigate.is_same_tab`: 是否同 tab 导航

**修复记录（2026-02-28 下午）**
- [x] 修复 content script 录制启动问题
  - 问题：`sasiki record` 命令执行后，server 收到命令但网页没有开始录制
  - 原因：background.ts 中 `.catch(() => {})` 静默吞掉了 sendMessage 错误
  - 原因：`ensureContentScriptInjected` 没有验证注入是否成功
  - 原因：注入后没有等待 content script 初始化完成
  - 解决：添加注入验证 + 100ms 延迟 + 重试机制
  - 修改文件：`src/sasiki/browser/extension/background.ts`

- [x] 修复 target_hint 信息捕获不完整问题
  - 问题：录制文件中很多 click 事件的 `name` 为空字符串，`parent_role` 为 null
  - 统计：39 个 click 事件中有 10 个 name 为空，主要来自 bilibili、小红书、深信服等站点
  - 原因：现代 Web 应用大量使用 `div`/`span`/`svg` 作为交互元素，无 ARIA 属性
  - 解决：重写 `createFingerprintFromElement`，添加多层 fallback 策略
    - 增强 name 提取：检查子图片 alt、从 CSS class 提取语义、提取 URL 路径
    - 扩展 parent role 搜索：向上遍历 5 层 DOM
    - 扩展 sibling 上下文：检查祖父元素子元素、前面兄弟元素
    - 添加识别属性：data-testid、有意义的 element id、关键 CSS class
  - 新增字段：`testId`、`elementId`、`classNames`
  - 修改文件：`src/sasiki/browser/extension/axtree.ts`

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

1. **P0**：Phase 1 E2E 验证任务执行（小红书搜索任务）
2. **P1**：基于验证结果进入 Phase 2: Skill 生成开发
3. **P1**：确定元素指纹匹配评分与阈值
4. **P2**：沉淀 LLM 决策提示词模板与评测集

---

## 下一步执行计划（Next Actions）

### 🔴 立即执行（今天/明天）

#### 1. 执行 Phase 1 E2E 验证任务
**负责人**: 开发者 + 测试人员
**耗时**: ~30 分钟

```bash
# 步骤 1: 确保最新代码已构建
cd src/sasiki/browser/extension && npm run build

# 步骤 2: 启动服务器（终端 1）
sasiki server start

# 步骤 3: 执行验证任务（终端 2）
sasiki record --name "xhs_e2e_verify_$(date +%m%d)"
```

**手动操作清单**:
- [x] 访问小红书首页
- [x] 完成搜索流程（关键词可自定义）
- [x] 完成筛选 + 滚动 + 点击笔记
- [x] 详情页交互 + 返回
- [x] 再次点击另一条笔记
- [x] Ctrl+C 停止录制

**验证录制文件**:
```bash
RECORDING_FILE="$HOME/.sasiki/recordings/browser/xhs_e2e_verify_*.jsonl"

# 检查 1: 事件数量
cat $RECORDING_FILE | wc -l  # 预期 >= 14

# 检查 2: 事件类型分布
cat $RECORDING_FILE | tail -n +2 | jq -r '.type' | sort | uniq -c
# 预期看到: click, type, navigate, scroll_load

# 检查 3: 数据完整性
cat $RECORDING_FILE | jq 'select(.targetHint) | .targetHint | {role, name, tag_name}' | head -20
```

**验收通过标准**:
- [x] 事件数量 >= 13
- [ ] 包含 4 种事件类型: click, type, navigate, scroll_load
- [ ] 每个 click/type 事件都有完整的 target_hint（role, name, tag_name）
- [ ] navigate 事件有 triggeredBy 字段
- [x] 无明显重复事件（input debounce 正常工作）

---

#### 2. 创建 E2E 测试脚本（自动化验收）
**负责人**: 开发者
**耗时**: ~2 小时
**输出**: `scripts/test_e2e_recording.py`

功能:
- 自动检查录制文件格式
- 统计事件类型分布
- 验证数据完整性
- 生成验收报告

---

### 🟡 本周内完成（Phase 2 启动准备）

#### 3. 更新事件协议（支持 scroll_load）
**文件**: `src/sasiki/server/websocket_protocol.py`

当前 `ActionType` 缺少 `SCROLL_LOAD`，需要添加:
```python
class ActionType(str, Enum):
    CLICK = "click"
    TYPE = "type"
    SELECT = "select"
    NAVIGATE = "navigate"
    SCROLL = "scroll"
    SCROLL_LOAD = "scroll_load"  # 新增
    TAB_SWITCH = "tab_switch"
    PAGE_ENTER = "page_enter"
```

同时更新 `RecordedAction` 支持 scroll_load 特有字段:
- `trigger`: 'infinite_scroll' | 'lazy_load'
- `loaded_content_hint`: string

---

#### 4. 录制文件可视化工具
**输出**: `sasiki recording show <file>` 命令

功能:
- 以时间线形式展示录制过程
- 显示每步操作的摘要
- 高亮可能的问题（如重复事件、缺失 target_hint）

示例输出:
```
📹 Recording: xhs_e2e_verify_0228
Duration: 2m 34s | Events: 15

Timeline:
[00:00:02] 🌐 navigate  → https://www.xiaohongshu.com
[00:00:05] 🖱️  click     → search box (role=textbox, name=搜索)
[00:00:08] ⌨️  type      → "通勤穿搭 春季"
[00:00:12] 🖱️  click     → 搜索按钮
[00:00:13] 🌐 navigate  → /search_result (triggeredBy: click)
...
```

---

### 🟢 Phase 2 开发规划（下周开始）

基于 E2E 验证结果，Phase 2 将分为 4 个迭代:

| 迭代 | 目标 | 关键产出 |
|------|------|----------|
| Week 1 | 事件合并算法 | `EventMerger` 类，将连续操作合并为语义步骤 |
| Week 2 | LLM Skill 生成 | `SkillGenerator` 类，提示词模板，YAML 输出 |
| Week 3 | 变量提取 | 自动识别可参数化的值（搜索词、选项等）|
| Week 4 | CLI 集成 | `sasiki skill generate` 命令，端到端验证 |

**Phase 2 DoD**:
- [ ] 对 5 条录制均可生成有效 YAML
- [ ] YAML 可通过模型校验
- [ ] 变量提取准确率 >= 80%（人工评审）

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

**方式 1: 使用 CLI 命令 (推荐)**

```bash
# 终端 1：启动 WebSocket 服务器
sasiki server start

# 终端 2：开始录制
sasiki record --name "xhs-e2e-01"
```

**方式 2: 使用 uv 运行 (开发调试)**

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

---

### 9. Phase 1 E2E 验收检查清单

执行完小红书验证任务后，逐项确认:

**A. 录制完整性**
- [ ] 总事件数 >= 13 个
- [ ] 事件类型覆盖 >= 3 种（click, type, navigate, scroll_load）
- [ ] 无丢失事件（按操作时序核对）
- [ ] 无重复/冗余事件（input debounce 正常工作）

**B. 数据质量**
```bash
# 快速验证命令
cat ~/.sasiki/recordings/browser/xhs_*.jsonl | jq '
  select(._meta | not) |
  {
    type,
    has_target: (.targetHint != null),
    has_url: (.pageContext.url != null),
    has_timestamp: (.timestamp != null)
  }
'
```

- [ ] 每个事件都有 `timestamp`, `type`, `pageContext`
- [ ] click/type 事件都有 `target_hint`（含 role, name, tag_name）
- [ ] 输入事件的 `value` 是完整文本（非中间状态）
- [ ] navigate 事件有 `triggeredBy` 和 `isSameTab`

**C. 时序正确性**
- [ ] input 事件在对应的 click 事件之前（blur/Enter flush 机制）
- [ ] click 事件在 navigate 事件之前（点击触发导航场景）
- [ ] scroll_load 仅在内容确实加载后记录

---

## 未来开发目标与 TODO

### 近期目标 (Next 2-4 Weeks)

#### Phase 2: Python Skill 生成
- [ ] WebSocket 服务接收并落盘事件流
- [ ] 实现事件合并算法（将连续操作合并为语义步骤）
- [ ] LLM 提示词工程：从录制事件生成 Skill YAML
- [ ] 变量提取（识别可参数化的输入值）
- [ ] Skill YAML 模型校验与存储

#### 体验优化
- [ ] 录制可视化：实时显示已录制步骤数
- [ ] 录制回放：可在 CLI 中查看录制过程的文本摘要
- [ ] 扩展 Popup UI：直接在浏览器中启动/停止录制

### 中期目标 (1-3 Months)

#### Phase 3: Agent 执行引擎
- [ ] Playwright + CDP 获取精简 DOM 上下文
- [ ] 元素指纹匹配引擎（基于 role/name/tag/context 评分）
- [ ] LLM 决策模块：在候选元素中选择最优目标
- [ ] 动作执行器：click/type/select/navigate 实现
- [ ] 执行日志与诊断工具

#### 稳定性建设
- [ ] 端到端测试覆盖（至少 3 个常见站点）
- [ ] 元素定位失败的重试与降级策略
- [ ] 动态等待机制（智能等待元素出现）

### 长期目标 (3-6 Months)

#### Phase 4: 产品化与扩展
- [ ] Skill  marketplace：分享与导入社区工作流
- [ ] 可视化 Skill 编辑器
- [ ] 执行历史与统计分析
- [ ] 支持更多浏览器（Firefox、Safari）

#### 智能化增强
- [ ] 从录制中自动发现变量（智能参数化）
- [ ] 失败场景的自我修复（自动选择替代元素）
- [ ] 批量执行与调度（定时任务）

### 技术债务与基础设施

- [ ] 补充单元测试（覆盖率 > 80%）
- [ ] TypeScript 类型严格化
- [ ] Python 类型注解完整覆盖
- [ ] CI/CD 流水线（自动测试、构建、发布）
- [ ] 文档站点（自动生成的 API 文档）

### 已规划但待排期

| 功能 | 优先级 | 备注 |
|------|--------|------|
| 延迟导航标记修复 | P2 | 当前 250ms 检测窗口在慢网络下可能失效 |
| 悬浮菜单/右键菜单录制 | P2 | 当前主要覆盖左键点击 |
| 拖拽操作录制 | P3 | 需要设计新的 action 类型 |
| iframe 支持 | P2 | 跨 iframe 元素定位与录制 |
| Shadow DOM 支持 | P2 | Web Components 兼容性 |
| 移动端浏览器支持 | P3 | 需要调研技术方案 |
