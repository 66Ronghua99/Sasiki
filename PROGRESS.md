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
- [ ] 每步均生成结构化事件（含 target_hint）
- [ ] 录制文件可被后端成功消费（100% 通过）

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
