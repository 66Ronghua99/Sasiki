# R0 代码重构计划（分阶段）

## 概述

本次重构旨在解决 Sasiki 代码库中的基础技术债务，在不改变行为的前提下提升代码质量、类型安全性和可维护性。

**核心原则**: 严格遵循"行为不变"原则，所有变更都是内部实现优化。

---

## 不改行为清单 (Behavior-Preserving Changes)

以下行为在重构前后**完全一致**:

1. **API 接口**: 所有公开类和函数的签名不变
2. **配置加载**: 环境变量和 .env 文件的读取逻辑不变
3. **日志输出**: 日志格式和内容不变，仅初始化时机调整
4. **命令行为**: CLI 命令的参数和功能完全保持
5. **工作流执行**: workflow refiner、replay agent 的执行逻辑不变
6. **数据存储**: workflow 和 recording 的存储格式和位置不变

## 可接受变更清单 (Acceptable Changes)

以下变更是允许的，不会影响外部依赖:

1. **日志格式细节**: 时间戳精度、字段顺序的微小调整
2. **导入时机**: 模块导入时不再立即创建目录或配置日志
3. **内部函数签名**: 私有方法 (`_` 开头) 的调整
4. **错误信息**: 错误提示的措辞优化
5. **代码组织**: import 语句的重新排序

## 回滚策略

### 快速回滚命令

```bash
# 回滚单个提交
git revert <commit-hash>

# 回滚到重构前状态 (假设重构前的最后一个提交是 abc123)
git reset --hard abc123
```

### 备份检查点

重构开始前，创建检查点标签:
```bash
git tag pre-r0-refactor
git push origin pre-r0-refactor
```

### 各任务回滚说明

| 任务 | 回滚复杂度 | 说明 |
|------|-----------|------|
| R0-01 | 无风险 | 仅文档删除即可 |
| R0-02 | 低 | `git revert` 单个提交 |
| R0-03 | 中 | 需同步回滚所有依赖文件变更 |
| R0-04 | 无风险 | `git revert` 即可，纯代码风格 |

---

## 任务清单

### R0-01: 建立基线文档与重构边界

**状态**: 📝 待实施
**风险**: 无风险

创建本文档，明确变更边界和回滚策略。

**DoD**:
- [x] 文档落地，可作为后续 PR checklist

---

### R0-02: 修复 replay_models 的类型循环与导出问题

**状态**: 🔧 待实施
**风险**: 低风险
**影响文件**: `src/sasiki/engine/replay_models.py`

**问题**: TYPE_CHECKING 自引用导致 mypy 报错

**变更**:
1. 删除第7-8行的 TYPE_CHECKING 块
2. 删除第4行未使用的 `TYPE_CHECKING` 导入

**DoD**:
- [x] 该文件 mypy 零报错
- [x] 所有现有测试通过

---

### R0-03: 统一配置与日志初始化入口，消除 import 副作用

**状态**: 🔧 待实施
**风险**: 中风险
**影响文件**:
- `src/sasiki/config.py`
- `src/sasiki/utils/logger.py`
- `src/sasiki/cli.py`
- `src/sasiki/llm/client.py`
- `src/sasiki/workflow/storage.py`
- `src/sasiki/engine/workflow_refiner.py`
- `src/sasiki/engine/replay_agent.py`
- `src/sasiki/commands/refine.py`
- `src/sasiki/workflow/recording_parser.py`
- `src/sasiki/workflow/skill_generator.py`

**问题**: 导入模块时立即创建目录和配置日志

**变更**:
1. config.py: 改为 lazy getter 模式
2. logger.py: 添加幂等控制，移除立即调用
3. cli.py: 保持显式初始化调用
4. 其他文件: 更新导入以使用新的 getter 函数

**DoD**:
- [x] import 任意模块不创建目录
- [x] import 任意模块不重复配置 logger
- [x] cli.py 入口调用 `configure_logging()` 一次即可正确配置
- [x] 所有现有测试通过

---

### R0-04: 清理命令层基础规范错误

**状态**: 🔧 待实施
**风险**: 无风险
**影响文件**:
- `src/sasiki/commands/run.py`
- `src/sasiki/commands/generate.py`
- `src/sasiki/commands/record.py`
- `src/sasiki/commands/refine.py`
- `src/sasiki/commands/workflows.py`

**变更**:
1. Import 排序 (PEP 8): 标准库 → 第三方 → 本地
2. 删除多余空行
3. 修复无意义 f-string (F541)
4. 添加缺失的返回类型注解

**DoD**:
- [x] 命令层 ruff 无基础告警（I/W/F541 等）
- [x] 所有现有测试通过

---

## 验证命令

每个任务完成后必须执行:

```bash
# 1. 代码规范检查
uv run ruff check src tests

# 2. 类型检查
uv run mypy src

# 3. 测试
uv run pytest -q
```

---

## 风险等级总览

| 任务 | 风险等级 | 说明 |
|------|---------|------|
| R0-01 | 无风险 | 仅文档 |
| R0-02 | 低风险 | 仅删除无用代码 |
| R0-03 | 中风险 | 修改初始化时序，需确保所有调用点更新 |
| R0-04 | 无风险 | 仅代码风格，无行为变更 |
