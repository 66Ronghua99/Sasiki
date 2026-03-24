# Refine Runtime E2E Runbook: TikTok Global Shop 客服消息检查

## 目标

固定一条更接近真实业务的 refine e2e 流程：

- 打开 TikTok Global Shop 卖家后台
- 进入客服消息页
- 检查是否存在未分配或未读消息
- 如果存在：
  - 打开一条消息
  - 基于上下文做简短礼貌回复并发送
  - 总结处理结果
- 如果不存在：
  - 优先确认已分配 / 未分配 / 未读等关键视图为空
  - 若系统确实无会话，则把“空 inbox”作为有效完成态返回
  - 若存在最近会话，则阅读最近客户对话并总结

## 为什么把它作为新基线

相比百度 smoke，这条流程更贴近 refine 的真实目标：

- 需要跨页面导航与新 tab 切换
- 需要识别队列 / inbox 空状态是不是有效完成
- 更能暴露 prompt 对 observationRef、re-observe、completion 判断的强弱

## 最新基线证据

- 最新 improved run：`20260324_090514_720`（2026-03-24）
- 证据目录：`artifacts/e2e/20260324_090514_720/`
- 结果：`completed`
- 关键观察：
  - 首轮直接复用了 bootstrap 暴露的 observation context，没有再对 `about:blank` 做 stale `observe.query`
  - 点击 `客户消息` 新开 tab 后，agent 明确先 `act.select_tab`，再做 fresh `observe.page`
  - 最终确认 `/chat/inbox/current` 下 `已分配` / `未分配` 视图与关键状态 filter 都为空，并正常 finish
- 对照基线 run：`20260324_085500_941`
  - 第一轮可跑通，但出现 stale snapshot 自恢复
  - `assistantTurnCount` 从 17 收敛到 10
  - `promotedKnowledgeCount` 从 3 收敛到 1

## 任务文案

```text
打开 TikTok Global Shop 客服页面 https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN&register_libra= 。
检查是否有未分配或未读消息。
如果有，优先处理一条：打开消息、基于对话上下文给出简短礼貌回复并发送，然后总结你处理了什么后结束。
如果没有，找到最近一次回复的客户，阅读其完整对话，并总结客户问题、当前状态、最近一轮回复内容后结束。
如果系统当前根本没有任何会话，明确说明已检查的视图和空状态后结束。
```

## 前置条件

1. 本机存在可用系统 Chrome。
2. `apps/agent-runtime/runtime.config.json` 已配置：
   - `launch: true`
   - `userDataDir: ~/.sasiki/chrome_profile`
   - `injectCookies: true`
   - `cookiesDir: ~/.sasiki/cookies`
3. `~/.sasiki/cookies/tiktokglobal.json` 存在并可用于 `seller.tiktokshopglobalselling.com`。
4. Playwright MCP 可正常拉起。
5. 已完成构建。

## 标准执行流程

### 1) 构建 runtime

```bash
npm --prefix apps/agent-runtime run build
```

### 2) 执行 e2e

```bash
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1 \
node apps/agent-runtime/dist/index.js \
  refine \
  --config apps/agent-runtime/runtime.config.json \
  "打开 TikTok Global Shop 客服页面 https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN&register_libra= 。检查是否有未分配或未读消息。如果有，优先处理一条：打开消息、基于对话上下文给出简短礼貌回复并发送，然后总结你处理了什么后结束。如果没有，找到最近一次回复的客户，阅读其完整对话，并总结客户问题、当前状态、最近一轮回复内容后结束。如果系统当前根本没有任何会话，明确说明已检查的视图和空状态后结束。"
```

### 3) 记录最新 run_id

```bash
RUN_ID=$(ls -1t artifacts/e2e | head -n1)
echo "$RUN_ID"
```

### 4) 验收检查

```bash
sed -n '1,200p' "artifacts/e2e/${RUN_ID}/run_summary.json"
rg -n '"toolName":"observe.page"|"toolName":"act.navigate"|"toolName":"act.click"|"toolName":"act.select_tab"|"toolName":"run.finish"' "artifacts/e2e/${RUN_ID}/event_stream.jsonl"
```

## 通过标准

1. `run_summary.json` 中 `status` 为 `completed`。
2. `event_stream.jsonl` 中存在 `run.finish`。
3. 证据能说明 agent 至少完成了：
   - 进入客服入口
   - 对聊天页做 fresh observation
   - 检查关键 tab / filter 或会话内容
4. 若 inbox 为空，finish summary 必须明确写出检查过的空视图，而不是只说“没找到”。

## 这条基线当前最值得观察的点

1. bootstrap observation 是否被 prompt 明确暴露给模型。
2. page-changing action 后是否立即 `observe.page`，避免对 stale snapshot 继续 `observe.query`。
3. 空 inbox 时是否能够快速 finish，而不是继续低价值搜索或记录过多 knowledge。

## 页面事实速记

- 首页 banner 中可见 `客户消息` 入口。
- 点击后会新开 tab 到 `/chat/inbox/current`。
- 当前样本 run 中：
  - `已分配` / `未分配` 均无实际会话
  - `未读 (0)`、`未回复 (0)` 等状态为 0
  - 列表只显示 `快速设置` 引导，不是客户对话

## 交付记录模板

每次执行后至少记录：

1. `run_id`
2. 最终状态
3. 关键证据路径
4. 是否出现 stale observation / tab drift / completion hesitation
5. 若为空 inbox，summary 是否明确说明“检查了哪些视图且确认为空”
