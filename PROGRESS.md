# Sasiki - 项目进度追踪

## 产品概述

**Sasiki**（日语「摹す」- 临摹、模仿）是一个通过观察用户屏幕操作，自动生成可复用工作流的 AI Agent。

核心理念：**你演示一遍，AI 学会你的工作方式**

## 技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 1: Universal Observation                │
│                         (视频录制层)                              │
│  • 全屏录制，捕获所有应用操作                                     │
│  • 事件驱动采样（点击、输入、应用切换）                            │
│  • 智能去重（相似画面合并）                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 2: Multimodal Understanding             │
│                         (离线分析层)                              │
│  • 多模态 LLM (Claude/GPT-4V) 分析截图序列                       │
│  • 理解：使用什么软件、执行什么操作、数据流向                      │
│  • 提取：阶段划分、可变量识别、检查点建议                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 3: Workflow Generation                  │
│                         (工作流生成层)                            │
│  • 生成结构化工作流定义 (YAML/JSON)                               │
│  • 支持参数化（搜索词、文件路径等变量）                            │
│  • 支持检查点（人工确认节点）                                     │
└─────────────────────────────────────────────────────────────────┘
```

## 开发路线图

### Phase 1: MVP ✅
- [x] 屏幕录制（macOS）- `src/sasiki/recorder/capture.py`
- [x] 事件捕获（鼠标、键盘、应用切换）- `src/sasiki/recorder/events.py`
- [x] 本地图像预处理（去重、压缩）- `src/sasiki/utils/image.py`
- [x] VLM 分析集成（OpenRouter）- `src/sasiki/llm/client.py`
- [x] 工作流提取和存储 - `src/sasiki/analyzer/session_analyzer.py`, `src/sasiki/workflow/`
- [x] CLI 界面 - `src/sasiki/cli.py`
  - [x] `sasiki record` - 开始录制
  - [x] `sasiki analyze <path>` - 分析录制
  - [x] `sasiki list` - 列出工作流
  - [x] `sasiki show <id>` - 查看工作流详情
  - [x] `sasiki delete <id>` - 删除工作流

### Phase 2: 执行引擎 🚧
- [ ] 基于视觉的回放（pyautogui）
- [x] `sasiki run <workflow>` 命令（基础框架，dry-run 模式）
- [ ] 检查点系统（人工确认）
- [ ] 错误处理和恢复
- [ ] 执行日志和反馈

### Phase 3: 渐进增强 📋
- [ ] Chrome 扩展（提供精确 DOM 选择器）
- [ ] Excel/Word 脚本优化
- [ ] 工作流版本管理
- [ ] 从多次执行中学习优化

### Phase 4: 高级功能 📋
- [ ] 工作流组合（调用其他工作流）
- [ ] 条件分支（基于屏幕状态决策）
- [ ] 定时触发和监控
- [ ] Web UI

## 项目结构

```
sasiki/
├── src/sasiki/
│   ├── cli.py                  # 命令行界面
│   ├── config.py               # 配置管理
│   ├── recorder/
│   │   ├── capture.py          # 屏幕录制（macOS）
│   │   └── events.py           # 事件数据模型
│   ├── analyzer/
│   │   └── session_analyzer.py # VLM 分析器
│   ├── llm/
│   │   └── client.py           # LLM 客户端（OpenRouter）
│   ├── workflow/
│   │   ├── models.py           # 工作流数据模型
│   │   └── storage.py          # 工作流存储
│   ├── storage/
│   │   └── __init__.py         # (预留)
│   └── utils/
│       ├── image.py            # 图像处理工具
│       └── logger.py           # 结构化日志
├── tests/                      # 测试
│   ├── test_workflow_models.py # 工作流模型测试
│   └── test_config.py          # 配置测试
├── examples/                   # 示例工作流
│   ├── 法律合同起草.yaml
│   └── 竞品价格监控.yaml
├── pyproject.toml             # 项目配置
├── .env.example               # 环境变量模板
└── README.md                  # 项目说明
```

## 最近一次更新 (2024-02-19)

### 完成的工作
1. ✅ 修复了 `storage/__init__.py` 为空文件的问题
2. ✅ 完善了 `utils/__init__.py`，导出常用工具函数
3. ✅ 添加了基础测试文件
4. ✅ 添加了示例工作流文件到 `examples/`

### 已知问题
1. `sasiki run` 命令尚未实现（Phase 2）
2. 缺少端到端测试
3. 需要补充更多单元测试

### 下一步计划
1. 实现 `sasiki run` 命令的基础框架
2. 添加更多测试覆盖
3. 完善错误处理
