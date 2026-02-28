# Agent Teams 技能手册

> **版本**: Claude Code Agent Teams Protocol v1.0
> **适用范围**: 所有支持 Agent 工具的 Claude Code 模型
> **目标读者**: 需要使用多代理协调功能的 AI 模型

---

## 目录

1. [架构概述](#1-架构概述)
2. [核心概念](#2-核心概念)
3. [工具链详解](#3-工具链详解)
4. [工作流程](#4-工作流程)
5. [通信协议](#5-通信协议)
6. [任务管理](#6-任务管理)
7. [最佳实践](#7-最佳实践)
8. [常见模式](#8-常见模式)
9. [错误处理](#9-错误处理)
10. [完整示例](#10-完整示例)

---

## 1. 架构概述

### 1.1 什么是 Agent Teams

Agent Teams 是 Claude Code 的多代理协调系统，允许一个**主代理（Leader）**创建并管理多个**子代理（Teammates）**，共同完成复杂任务。

### 1.2 架构拓扑

```
┌─────────────────────────────────────────────────────────────┐
│                        用户 (User)                           │
└───────────────────────────┬─────────────────────────────────┘
                            │ 任务请求
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    主代理 (Team Lead)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  任务规划    │  │  团队管理    │  │  结果整合    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└──────────┬────────────────────────────────────────────────────┘
           │ TeamCreate / Agent
           ▼
┌─────────────────────────────────────────────────────────────┐
│                     共享任务列表                             │
│           ~/.claude/tasks/{team-name}/                      │
└──────────┬────────────────────────────┬─────────────────────┘
           │                            │
     ┌─────▼─────┐              ┌───────▼────────┐
     │  Agent A  │◄────────────►│    Agent B     │
     │(frontend) │   消息通信    │   (backend)    │
     └───────────┘              └────────────────┘
```

### 1.3 核心设计原则

| 原则 | 说明 |
|------|------|
| **职责分离** | 每个代理专注于特定领域或任务 |
| **并行执行** | 独立任务可同时进行，提高效率 |
| **状态共享** | 通过任务列表实现状态同步 |
| **消息驱动** | 代理间通过显式消息通信 |
| **生命周期管理** | Leader 负责创建和终止团队成员 |

---

## 2. 核心概念

### 2.1 角色定义

#### Team Lead (主代理)
- **创建者**: 负责创建团队和分配任务
- **协调者**: 管理代理间的依赖关系
- **决策者**: 决定何时创建/终止代理
- **唯一性**: 每个团队只有一个 Leader

#### Teammate (子代理)
- **执行者**: 完成分配的具体任务
- **报告者**: 向 Leader 汇报进度和结果
- **有限生命周期**: 任务完成后应关闭
- **可并行**: 多个 teammate 可同时运行

### 2.2 关键实体

#### Team (团队)
```typescript
interface Team {
  name: string;                    // 团队唯一标识
  description: string;             // 团队用途描述
  members: Agent[];                // 成员列表
  taskList: Task[];                // 共享任务列表
  configPath: string;              // ~/.claude/teams/{name}/config.json
  tasksPath: string;               // ~/.claude/tasks/{name}/
}
```

#### Task (任务)
```typescript
interface Task {
  id: string;                      // 任务唯一ID
  subject: string;                 // 简短标题（祈使句）
  description: string;             // 详细描述
  status: 'pending' | 'in_progress' | 'completed' | 'deleted';
  owner: string | null;            // 负责代理的名称
  blockedBy: string[];             // 阻塞此任务的任务ID
  blocks: string[];                // 此任务阻塞的任务ID
  metadata: Record<string, any>;   // 扩展信息
}
```

#### Agent Types (代理类型)

| 类型 | 可用工具 | 适用场景 |
|------|----------|----------|
| `Explore` | Read, Glob, Grep, WebFetch, WebSearch | 代码探索、研究 |
| `Plan` | Read, Glob, Grep, WebFetch, WebSearch | 架构设计、方案规划 |
| `general-purpose` | 全部工具 | 通用任务、代码修改 |
| `voltagent-core-dev:*` | 全部工具 | 专业开发领域 |
| `statusline-setup` | Read, Edit | 状态栏配置 |
| `claude-code-guide` | Read, Glob, Grep, WebFetch, WebSearch | Claude Code 相关问题 |

---

## 3. 工具链详解

### 3.1 TeamCreate - 创建团队

**功能**: 创建新的代理团队，初始化任务列表

**参数**:
```typescript
{
  team_name: string;       // 团队唯一名称（必需）
  description?: string;    // 团队描述
  agent_type?: string;     // Leader 的角色类型
}
```

**副作用**:
- 创建 `~/.claude/teams/{team-name}/config.json`
- 创建 `~/.claude/tasks/{team-name}/` 目录
- 当前会话切换到该团队上下文

**使用时机**: 任务需要多代理协作时

**示例**:
```json
{
  "team_name": "ecommerce-feature",
  "description": "实现电商购物车功能"
}
```

---

### 3.2 Agent - 生成团队成员

**功能**: 创建并启动子代理

**参数**:
```typescript
{
  description: string;              // 简短任务描述（3-5词）
  prompt: string;                   // 详细任务指令
  subagent_type: string;            // 代理类型（见2.2节）
  name?: string;                    // 代理名称（用于通信）
  team_name?: string;               // 所属团队
  mode?: "acceptEdits" | "bypassPermissions" | "default" | "dontAsk" | "plan";
  model?: "sonnet" | "opus" | "haiku";
  max_turns?: number;
  run_in_background?: boolean;      // 后台运行
  resume?: string;                  // 恢复之前的代理
  isolation?: "worktree";           // 隔离模式
}
```

**关键参数说明**:

| 参数 | 说明 |
|------|------|
| `description` | 显示在状态中的简短描述 |
| `prompt` | 完整的任务上下文和要求 |
| `subagent_type` | 决定代理可用工具集 |
| `name` | 用于 SendMessage 的标识符 |
| `run_in_background` | true 时不等待结果，适合并行任务 |

**使用模式**:

```typescript
// 模式1: 前台执行（等待结果）
{
  description: "探索代码库",
  prompt: "搜索所有 API 端点定义...",
  subagent_type: "Explore"
}
// 返回: 代理执行结果

// 模式2: 后台并行（不等待）
{
  description: "运行测试",
  prompt: "执行所有单元测试...",
  subagent_type: "general-purpose",
  run_in_background: true
}
// 返回: { task_id: string, output_file: string }
```

---

### 3.3 SendMessage - 代理通信

**功能**: 在团队成员间发送消息

**消息类型**:

```typescript
// 类型1: 直接消息 (DM)
{
  type: "message",
  recipient: string,       // 接收方名称
  content: string,         // 消息内容
  summary: string          // 5-10字摘要
}

// 类型2: 广播（慎用）
{
  type: "broadcast",
  content: string,
  summary: string
}

// 类型3: 请求关闭代理
{
  type: "shutdown_request",
  recipient: string,
  content?: string
}

// 类型4: 响应关闭请求
{
  type: "shutdown_response",
  request_id: string,
  approve: boolean,
  content?: string
}

// 类型5: 计划审批响应
{
  type: "plan_approval_response",
  request_id: string,
  recipient: string,
  approve: boolean,
  content?: string
}
```

**重要规则**:
- 必须使用代理**名称**（如 "researcher"），不是 UUID
- 子代理的输出对 Leader 不可见，必须通过 SendMessage 显式通信
- 消息会自动排队，代理空闲时接收

---

### 3.4 Task 管理工具

#### TaskCreate - 创建任务
```typescript
{
  subject: string;         // 简短标题（祈使句）
  description: string;     // 详细描述
  activeForm?: string;     // 进行时态描述
  metadata?: object;
}
```

#### TaskList - 列出任务
```typescript
// 无参数，返回所有任务的摘要
// 包括：id, subject, status, owner, blockedBy
```

#### TaskGet - 获取任务详情
```typescript
{
  taskId: string;
}
// 返回：完整任务信息 + blocks + blockedBy
```

#### TaskUpdate - 更新任务
```typescript
{
  taskId: string;
  status?: "pending" | "in_progress" | "completed" | "deleted";
  subject?: string;
  description?: string;
  activeForm?: string;
  owner?: string;
  metadata?: object;
  addBlocks?: string[];      // 添加阻塞关系
  addBlockedBy?: string[];
}
```

---

### 3.5 TeamDelete - 删除团队

**功能**: 清理团队资源

**前置条件**: 所有代理必须已关闭

**警告**: 会删除团队和任务目录，不可恢复

---

## 4. 工作流程

### 4.1 标准工作流

```
1. 评估任务复杂度
   └── 是否需要多代理协作？
       ├── 否 → 直接执行
       └── 是 → 继续

2. 创建团队
   └── TeamCreate(team_name, description)

3. 规划任务
   └── 使用 TaskCreate 创建任务列表
   └── 使用 TaskUpdate 设置依赖关系

4. 分配代理
   └── Agent(subagent_type, prompt, name)
   └── 可选择 run_in_background 并行执行

5. 监控进度
   └── TaskList 检查任务状态
   └── SendMessage 与代理通信

6. 整合结果
   └── 收集各代理输出
   └── 必要时请求关闭代理

7. 清理资源
   └── 确认所有代理已关闭
   └── TeamDelete(可选)
```

### 4.2 代理生命周期

```
创建
  │
  ▼
┌─────────────┐
│   IDLE      │ ◄── 等待分配任务
│  (空闲)     │
└──────┬──────┘
       │ TaskUpdate(owner)
       ▼
┌─────────────┐
│  WORKING    │ ◄── 执行任务
│  (执行中)    │
└──────┬──────┘
       │ 任务完成
       ▼
┌─────────────┐
│  REPORTING  │ ◄── SendMessage 汇报
│  (汇报结果)  │
└──────┬──────┘
       │ shutdown_request
       ▼
┌─────────────┐
│  SHUTDOWN   │ ◄── 资源释放
│  (已关闭)    │
└─────────────┘
```

### 4.3 任务状态流转

```
pending ──────────┐
  │               │
  │ TaskUpdate    │
  ▼ (in_progress) │
in_progress       │
  │               │
  │ 任务完成       │
  ▼               │
completed ◄───────┘
  │
  │ 或放弃
  ▼
deleted
```

---

## 5. 通信协议

### 5.1 Leader → Teammate 通信

**分配任务**:
```typescript
{
  type: "message",
  recipient: "frontend-dev",
  content: "请实现登录页面的 UI 组件，要求...",
  summary: "分配前端开发任务"
}
```

**请求状态**:
```typescript
{
  type: "message",
  recipient: "tester",
  content: "请汇报当前测试进度和发现的问题",
  summary: "查询测试进度"
}
```

**请求关闭**:
```typescript
{
  type: "shutdown_request",
  recipient: "researcher",
  content: "研究任务已完成，可以关闭了"
}
```

### 5.2 Teammate → Leader 通信

**任务完成**:
```typescript
{
  type: "message",
  recipient: "team-lead",  // 或 Leader 的名称
  content: "任务已完成。发现 API 端点在 /api/v1/users...",
  summary: "API 探索完成"
}
```

**请求帮助**:
```typescript
{
  type: "message",
  recipient: "team-lead",
  content: "在文件 X 中发现冲突，需要决策...",
  summary: "需要技术决策"
}
```

**响应关闭请求**:
```typescript
{
  type: "shutdown_response",
  request_id: "abc-123",
  approve: true
}
```

### 5.3 点对点通信 (Teammate ↔ Teammate)

```typescript
// Agent A 发送给 Agent B
{
  type: "message",
  recipient: "backend-dev",
  content: "API 契约已确认：POST /api/login 返回 {...}",
  summary: "API 契约确认"
}
```

---

## 6. 任务管理

### 6.1 任务依赖管理

**场景**: 任务 B 依赖任务 A 完成

```typescript
// 1. 创建任务 A
TaskCreate({
  subject: "设计数据库 Schema",
  description: "..."
}); // 返回 taskId: "task-1"

// 2. 创建任务 B，设置依赖
TaskCreate({
  subject: "实现 API 接口",
  description: "..."
}); // 返回 taskId: "task-2"

TaskUpdate({
  taskId: "task-2",
  addBlockedBy: ["task-1"]
});

// 3. 代理查询可用任务时，会发现 task-2 被阻塞
// 直到 task-1 标记为 completed
```

### 6.2 代理领取任务

```typescript
// 代理通过 TaskList 查看可用任务
const tasks = TaskList();

// 找到 pending 且无 blockedBy 的任务
const available = tasks.filter(
  t => t.status === 'pending' &&
       t.blockedBy.length === 0 &&
       !t.owner
);

// 领取任务
TaskUpdate({
  taskId: available[0].id,
  owner: "my-agent-name",
  status: "in_progress"
});
```

### 6.3 任务优先级策略

- **ID 顺序**: 优先处理 ID 较小的任务
- **依赖深度**: 优先处理阻塞其他任务的关键路径
- **预估耗时**: 短时间任务优先，快速获得反馈

---

## 7. 最佳实践

### 7.1 团队规模

| 团队规模 | 适用场景 | 注意事项 |
|----------|----------|----------|
| 2-3 人 | 简单功能开发 | Leader 管理 overhead 低 |
| 4-5 人 | 中等复杂度任务 | 需要明确的任务边界 |
| 6+ 人 | 大型重构/多模块 | 建议拆分多个小团队 |

### 7.2 代理类型选择

```
需要修改代码？
├── 是 → general-purpose 或 voltagent-core-dev:*
│         └── 前端 → frontend-developer
│         └── 后端 → backend-developer
│         └── 全栈 → fullstack-developer
└── 否 → 只读代理
          └── 探索代码 → Explore
          └── 设计方案 → Plan
          └── API 设计 → api-designer
```

### 7.3 并行策略

**可并行**:
- 前后端独立开发
- 多个文件的并行重构
- 独立测试用例编写

**必须串行**:
- 有依赖关系的功能开发
- 修改同一文件
- 数据库 Schema 变更 → API 实现

### 7.4 消息通信原则

1. **显式优于隐式**: 明确发送消息，不要假设代理知道上下文
2. **及时汇报**: 遇到阻塞立即通知 Leader
3. **结果完整**: 任务完成时提供完整上下文，方便整合
4. **避免广播**: 尽量点对点通信，减少噪音

### 7.5 任务粒度

**好的任务**:
- "实现 User 模型的 CRUD API"
- "为 login 函数添加单元测试"
- "重构 auth middleware 的错误处理"

**不好的任务**:
- "完成整个项目"（太大）
- "修复 bug"（太模糊）
- "优化性能"（无明确完成标准）

---

## 8. 常见模式

### 8.1 探索-规划-执行模式

```typescript
// 1. 探索阶段 - 并行探索多个区域
const explorer1 = Agent({
  name: "explorer-api",
  subagent_type: "Explore",
  prompt: "探索所有 API 路由定义...",
  run_in_background: true
});

const explorer2 = Agent({
  name: "explorer-db",
  subagent_type: "Explore",
  prompt: "探索数据库模型定义...",
  run_in_background: true
});

// 等待结果（通过后台任务输出文件或消息）

// 2. 规划阶段
const planner = Agent({
  name: "architect",
  subagent_type: "Plan",
  prompt: "基于探索结果设计迁移方案..."
});

// 3. 执行阶段 - 基于规划结果
const implementer = Agent({
  name: "developer",
  subagent_type: "general-purpose",
  prompt: "按照方案实现代码..."
});
```

### 8.2 前后端协作模式

```typescript
// 1. 创建依赖任务
TaskCreate({
  subject: "设计 API 契约",
  description: "定义 REST API 端点和请求/响应格式"
}); // -> task-api-design

TaskCreate({
  subject: "实现后端 API",
  description: "..."
}); // -> task-backend
TaskUpdate({
  taskId: "task-backend",
  addBlockedBy: ["task-api-design"]
});

TaskCreate({
  subject: "实现前端页面",
  description: "..."
}); // -> task-frontend
TaskUpdate({
  taskId: "task-frontend",
  addBlockedBy: ["task-api-design"]
});

// 2. 先执行 API 设计
const apiDesigner = Agent({
  name: "api-designer",
  subagent_type: "api-designer",
  prompt: "设计用户认证 API..."
});
// 完成后标记 task-api-design 完成

// 3. 并行执行前后端
const backend = Agent({
  name: "backend-dev",
  subagent_type: "backend-developer",
  prompt: "按照 API 契约实现后端...",
  run_in_background: true
});

const frontend = Agent({
  name: "frontend-dev",
  subagent_type: "frontend-developer",
  prompt: "按照 API 契约实现前端...",
  run_in_background: true
});
```

### 8.3 测试驱动模式

```typescript
// 开发人员实现功能
const developer = Agent({
  name: "developer",
  subagent_type: "general-purpose",
  prompt: "实现用户注册功能...",
  run_in_background: true
});

// 测试人员同步编写测试
const tester = Agent({
  name: "tester",
  subagent_type: "general-purpose",
  prompt: "为注册功能编写单元测试和集成测试...",
  run_in_background: true
});

// 收集结果并审查
```

---

## 9. 错误处理

### 9.1 常见错误

#### 错误1: 代理名称错误
```typescript
// ❌ 错误
SendMessage({
  recipient: "agent-uuid-123",  // 这是 UUID，不是名称
  ...
});

// ✅ 正确
SendMessage({
  recipient: "researcher",      // 使用创建时指定的 name
  ...
});
```

#### 错误2: 未等待后台代理
```typescript
// ❌ 错误 - 可能代理还没完成
const task = Agent({ run_in_background: true });
// 立即尝试读取结果

// ✅ 正确
const task = Agent({ run_in_background: true });
// 通过 TaskOutput 轮询或等待消息
```

#### 错误3: 删除团队前未关闭代理
```typescript
// ❌ 错误
TeamDelete();  // 如果还有运行中的代理会失败

// ✅ 正确
SendMessage({
  type: "shutdown_request",
  recipient: "agent-name"
});
// 等待确认后
TeamDelete();
```

### 9.2 故障排查

**代理没有响应**:
1. 检查代理是否真的在运行（TaskList 查看状态）
2. 确认消息 recipient 使用的是名称不是 UUID
3. 检查代理是否处于 plan mode 等待用户输入

**任务依赖不生效**:
1. 确认 blockedBy 使用的是 task ID 数组
2. 检查前置任务是否标记为 completed
3. 代理需要定期调用 TaskList 查看最新状态

---

## 10. 完整示例

### 10.1 示例: 全栈功能开发

```typescript
// ========== 阶段1: 初始化 ==========

// 创建团队
TeamCreate({
  team_name: "user-auth-feature",
  description: "实现用户认证系统"
});

// 创建任务列表
TaskCreate({
  subject: "设计 API 契约",
  description: "定义 /api/register 和 /api/login 的请求响应格式"
});

TaskCreate({
  subject: "实现后端 API",
  description: "实现用户注册和登录的后端接口",
  activeForm: "实现后端 API"
});

TaskCreate({
  subject: "实现前端页面",
  description: "实现登录和注册页面 UI",
  activeForm: "实现前端页面"
});

TaskCreate({
  subject: "编写测试用例",
  description: "为认证功能编写单元测试和 E2E 测试",
  activeForm: "编写测试用例"
});

// 设置依赖
TaskUpdate({
  taskId: "task-backend",
  addBlockedBy: ["task-api-design"]
});
TaskUpdate({
  taskId: "task-frontend",
  addBlockedBy: ["task-api-design"]
});
TaskUpdate({
  taskId: "task-tests",
  addBlockedBy: ["task-backend", "task-frontend"]
});

// ========== 阶段2: 探索现有代码 ==========

const explorer = Agent({
  name: "code-explorer",
  subagent_type: "Explore",
  prompt: `
探索当前项目的代码结构：
1. 查找现有的用户模型定义
2. 查找现有的认证中间件
3. 查找前端路由配置
4. 查找测试框架和现有测试示例

请输出：
- 相关文件路径
- 现有实现的关键代码片段
- 推荐的集成方式
`
});

// 等待探索结果（通过返回的消息）
// 假设收到了 code-explorer 的消息...

// ========== 阶段3: 并行开发 ==========

// 启动 API 设计（阻塞后续任务）
const apiDesigner = Agent({
  name: "api-designer",
  subagent_type: "api-designer",
  prompt: `
基于探索结果，设计用户认证 API：

要求：
1. POST /api/register - 用户注册
2. POST /api/login - 用户登录
3. POST /api/logout - 用户登出
4. GET /api/me - 获取当前用户信息

输出格式：
- OpenAPI 规范
- 请求/响应示例
- 错误码定义
`
});

// API 设计完成后，通过消息通知
SendMessage({
  type: "message",
  recipient: "api-designer",
  content: "请确认设计完成并发送 API 规范文档"
});

// 收到 API 规范后，更新任务状态
TaskUpdate({
  taskId: "task-api-design",
  status: "completed"
});

// 现在可以并行执行前后端
const backendDev = Agent({
  name: "backend-dev",
  subagent_type: "backend-developer",
  prompt: `
按照 API 规范实现后端：

API 规范：
[从 api-designer 的消息中提取]

要求：
1. 使用 JWT 进行认证
2. 密码使用 bcrypt 加密
3. 添加输入验证
4. 返回标准错误格式

请：
1. 实现代码
2. 运行测试确保通过
3. 完成后发送代码文件路径和测试结果
`,
  run_in_background: true
});

const frontendDev = Agent({
  name: "frontend-dev",
  subagent_type: "frontend-developer",
  prompt: `
按照 API 规范实现前端：

要求：
1. /login 页面
2. /register 页面
3. 表单验证
4. 错误提示

请：
1. 实现组件
2. 完成后发送文件路径
`,
  run_in_background: true
});

// 等待两者完成（通过 TaskOutput 或消息）

// ========== 阶段4: 测试 ==========

const tester = Agent({
  name: "tester",
  subagent_type: "general-purpose",
  prompt: `
为认证功能编写测试：

后端测试：
1. 单元测试：认证逻辑
2. 集成测试：API 端点

前端测试：
1. 组件测试：表单验证
2. E2E 测试：完整用户流程

请运行所有测试并报告结果。
`,
  run_in_background: true
});

// ========== 阶段5: 清理 ==========

// 收到所有代理完成消息后
SendMessage({
  type: "shutdown_request",
  recipient: "backend-dev"
});
SendMessage({
  type: "shutdown_request",
  recipient: "frontend-dev"
});
SendMessage({
  type: "shutdown_request",
  recipient: "tester"
});

// 确认所有代理已关闭
TeamDelete();
```

### 10.2 示例: 代码重构

```typescript
// 创建重构团队
TeamCreate({
  team_name: "refactoring-team",
  description: "重构 legacy 代码"
});

// 探索现有代码
const explorer = Agent({
  name: "explorer",
  subagent_type: "Explore",
  prompt: "找出所有需要重构的函数，分析依赖关系"
});

// 基于探索结果，创建并行重构任务
// 假设有 3 个独立模块需要重构

const refactors = [
  { name: "refactor-auth", file: "auth.js" },
  { name: "refactor-db", file: "database.js" },
  { name: "refactor-utils", file: "utils.js" }
];

for (const r of refactors) {
  Agent({
    name: r.name,
    subagent_type: "general-purpose",
    prompt: `重构 ${r.file}，遵循以下原则...`,
    run_in_background: true
  });
}

// 验证代理
const validator = Agent({
  name: "validator",
  subagent_type: "general-purpose",
  prompt: "运行所有测试确保重构未破坏功能"
});
```

---

## 附录 A: 快速参考卡

### A.1 工具速查表

| 工具 | 用途 | 关键参数 |
|------|------|----------|
| TeamCreate | 创建团队 | team_name, description |
| Agent | 创建代理 | description, prompt, subagent_type, name |
| SendMessage | 发送消息 | type, recipient, content, summary |
| TaskCreate | 创建任务 | subject, description |
| TaskUpdate | 更新任务 | taskId, status, owner |
| TaskList | 列出任务 | 无 |
| TeamDelete | 删除团队 | 无 |

### A.2 代理类型速查

| 场景 | 类型 |
|------|------|
| 探索代码 | Explore |
| 设计方案 | Plan |
| 写代码 | general-purpose |
| 前端开发 | frontend-developer |
| 后端开发 | backend-developer |
| API 设计 | api-designer |

### A.3 消息模板

**分配任务**:
```
任务: [简述]
上下文: [背景信息]
要求: [具体产出]
完成标准: [如何判断完成]
```

**报告进度**:
```
进度: [百分比或阶段]
已完成: [具体工作]
阻塞: [如果有]
下一步: [计划]
```

**报告完成**:
```
任务已完成。
产出: [文件/代码/文档]
关键决策: [如果有]
待确认: [需要 Leader 决策的问题]
```

---

## 附录 B: 术语表

| 术语 | 定义 |
|------|------|
| Team Lead | 团队主代理，负责协调 |
| Teammate | 团队成员代理 |
| Task | 待完成的工作单元 |
| Blocked | 任务因依赖未满足而无法开始 |
| Background | 代理在后台运行，不阻塞 Leader |
| Plan Mode | 代理需要用户审批计划的模式 |
| Idle | 代理空闲，等待分配工作 |

---

*本文档基于 Claude Code Agent Teams Protocol v1.0 编写*
