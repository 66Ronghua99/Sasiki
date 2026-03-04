# E2E Migration Closed-Loop Guide

## 1. Goal
验证迁移后的主链路是否达到与当前目标一致的业务效果。  
只有在完整完成以下闭环时，才判定迁移成功：

1. 启动 CDP Chromium
2. 注入 Cookie
3. 打开小红书
4. 搜索
5. 打开帖子
6. 点赞
7. 截图

## 2. Prerequisites
- Node 20 LTS（迁移后主运行时）。
- 可用的小红书登录 Cookie（未过期，具备点赞权限）。
- 本机可用 CDP 端点（默认 `http://localhost:9222`）。
- Playwright MCP 可启动（推荐 `@playwright/mcp@latest`）。
- 运行目录具备 `artifacts/` 写权限。

## 3. Test Inputs (Fixed)
- 目标站点：`https://www.xiaohongshu.com/`
- 固定搜索词：`咖啡豆 推荐`
- 目标帖子选择：搜索结果首个可见帖子
- 截图文件名：`artifacts/e2e/{run_id}/final.png`

## 4. Execution Procedure
1. 生成 `run_id`（格式建议：`YYYYMMDD_HHMMSS`）。
2. 启动 Chromium（CDP 模式），记录端点、profile 路径。
3. 注入 Cookie，记录文件数与注入条数。
4. 打开小红书首页并等待首页主内容可见。
5. 输入固定搜索词并提交搜索。
6. 在结果页打开首个可见帖子。
7. 在帖子页执行点赞动作。
8. 截图保存到 `artifacts/e2e/{run_id}/final.png`。

## 5. Assertions
- `A1` 启动成功：CDP 连接建立，浏览器上下文可用。
- `A2` Cookie 生效：访问首页后处于登录态（头像/用户菜单可见）。
- `A3` 搜索成功：URL 或页面元素体现搜索结果页状态。
- `A4` 进帖成功：帖子详情页主容器可见。
- `A5` 点赞成功：点赞按钮状态从未赞变为已赞（或计数变化）。
- `A6` 截图成功：`final.png` 存在且文件大小大于 0。

## 6. Failure Handling
- 错误分类：
  - `timeout`
  - `tool_error`
  - `auth_expired`
  - `anti_bot`
- 自动重试策略：
  - 仅 `timeout` 与可恢复 `tool_error` 允许重试，最多 2 次。
  - `auth_expired` 与 `anti_bot` 直接失败并进入人工处理。

## 7. Artifacts Contract
每次运行输出到 `artifacts/e2e/{run_id}/`：
- `steps.json`：步骤结果与断言状态
- `mcp_calls.jsonl`：工具调用时序日志
- `runtime.log`：运行时日志
- `final.png`：最终截图

## 8. Pass/Fail Criteria
- **单次通过**：`A1-A6` 全部通过。
- **迁移成功**：闭环 `20/20` 连续通过。
- **稳定性通过**：闭环 `100` 次运行无进程崩溃，且所有失败均有可追踪错误码与日志。

## 9. Current Baseline Note
当前基线能力仅稳定到“进入网页、搜索、打开帖子”。  
迁移验收必须新增并稳定通过“点赞 + 截图”两步，才算真正完成替换。
