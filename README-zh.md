# Sasiki

> 观察用户操作，自动生成可复用的工作流 Agent

Sasiki（日语「摹す」- 临摹、模仿）当前采用浏览器自动化主线：通过浏览器内操作录制与 Agent 执行，生成可复用的自动化工作流。

## 核心理念

**你演示一遍，AI 学会你的工作方式**

不需要写代码，不需要描述需求，只需正常工作，Sasiki 会自动学习并为你生成可复用的工作流。

## 当前主线

- 浏览器录制（Chrome Extension）+ 元素指纹
- Python Agent 服务（WebSocket）
- Skill 生成（YAML）
- Playwright 执行引擎

屏幕录制路线已停止维护，并从代码主干移除。

## 快速开始

### 安装

```bash
# 方式1: 使用 pip 安装 (推荐)
pip install -e ".[dev]"

# 方式2: 使用 uv 安装
uv pip install -e ".[dev]"
```

安装完成后，命令行工具 `sasiki` 将可用：

```bash
# 查看帮助
sasiki --help

# 查看已保存的工作流
sasiki list

# 查看工作流详情
sasiki show "法律合同起草"
```

### 配置 API Key

```bash
cp .env.example .env
# 编辑 .env，添加 OPENROUTER_API_KEY
```

## 浏览器操作录制指南

Sasiki 可以通过 Chrome 扩展录制用户在浏览器中的操作，自动生成可复用的工作流。

### 1. 构建并加载扩展

```bash
# 构建扩展并拷贝到根目录的 extension/ 文件夹
./build_extension.sh          # macOS/Linux
# 或
.\build_extension.ps1         # Windows
```

然后加载扩展到 Chrome：
1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」（右上角开关）
3. 点击「加载已解压的扩展程序」
4. 选择项目根目录的 `extension/` 文件夹

### 2. 启动录制服务

```bash
# 终端 1: 启动 WebSocket 服务器
sasiki server start

# 终端 2: 开始录制会话
sasiki record --name "my-task"
```

### 3. 执行浏览器操作

在 Chrome 中执行你想要录制的操作，例如：

| 操作类型 | 示例 | 说明 |
|---------|------|------|
| 点击 | 点击按钮、链接、卡片 | 自动记录元素指纹 |
| 输入 | 在搜索框输入文本 | 支持原生 input 和 contenteditable |
| 选择 | 下拉菜单选择 | 记录选项值 |
| 滚动 | 无限滚动加载 | 智能检测内容加载 |
| 导航 | 页面跳转、前进后退 | 标记导航来源 |

录制事件类型：
- `click` - 点击元素
- `type` - 文本输入（支持 `<input>`、`<textarea>`、`<div contenteditable>`）
- `select` - 下拉选择
- `navigate` - 页面导航
- `scroll_load` - 滚动加载内容（智能检测）

### 4. 停止录制

在录制终端按 `Ctrl+C`，录制文件将自动保存到 `~/.sasiki/recordings/browser/<name>.jsonl`

### 5. 查看录制结果

```bash
# 查看录制文件内容
cat ~/.sasiki/recordings/browser/my-task.jsonl

# 格式化查看（如果安装了 jq）
cat ~/.sasiki/recordings/browser/my-task.jsonl | jq
```

### 录制示例：小红书搜索任务

```bash
# 1. 启动服务器
sasiki server start

# 2. 另一个终端启动录制
sasiki record --name "xhs-search"

# 3. 在 Chrome 中执行以下操作：
#    - 访问 https://www.xiaohongshu.com
#    - 点击搜索框
#    - 输入 "通勤穿搭 春季"
#    - 按 Enter
#    - 点击「最热」筛选
#    - 滚动页面
#    - 点击笔记卡片进入详情
#    - 点击返回

# 4. Ctrl+C 停止录制
```

## 使用场景

- **法律合同起草**: 搜索法条 → 整理要点 → 生成合同
- **竞品价格监控**: 访问网站 → 提取数据 → 更新表格
- **周报生成**: 提取项目数据 → 整理 → 生成报告
- **任何重复性浏览器工作**

## 架构

```
录制 (Chrome Extension) → 生成 (Skill) → 执行 (Playwright Agent)
```

1. **录制层**: 浏览器事件采集 + 元素指纹
2. **Skill 层**: LLM 合并语义动作并提取变量
3. **执行层**: 规则匹配候选元素 + LLM 文本决策 + Playwright 动作
4. **反馈层**: 失败重试和人工介入（规划中）

## 参考实现

`src/sasiki/browser/extension/` 目录是当前浏览器能力建设的核心实现（axtree、content/background script 等），项目主线会围绕它持续演进。

## 成本

当前架构优先使用文本与结构化上下文进行决策，减少截图和视觉 token 消耗。

## 开发路线图

详见 `PROGRESS.md`，当前阶段：

- ✅ Phase 1: Extension 录制链路（已完成）
- 🔄 Phase 2: Python Skill 生成（进行中）
- 📋 Phase 3: Agent 执行引擎（规划中）
- 📋 Phase 4: 稳定性与体验（规划中）

## 文档

- `PROGRESS.md` - 项目进度与详细文档
- `AGENTS.md` - Agent 开发指南
- `Memory.md` - 技术经验与踩坑记录

## License

MIT
