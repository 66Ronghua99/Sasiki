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

```bash
# 安装
pip install -e ".[dev]"

# 配置 API Key
cp .env.example .env
# 编辑 .env，添加 OPENROUTER_API_KEY

# 查看已保存的工作流
sasiki list

# 查看工作流详情
sasiki show "法律合同起草"
```

浏览器录制与执行链路正在建设中，详见 `PROGRESS.md`。

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

## 文档

详见 `PROGRESS.md` 与 `AGENTS.md`

## License

MIT
