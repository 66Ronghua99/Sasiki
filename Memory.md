# Sasiki - 经验速记（精简版）

本文件只保留可复用的关键结论，避免长篇复盘。

---

## 关键经验（高频问题）

### 1) 录制启动但页面没反应
- **根因**：`sendMessage` 错误被吞、注入后未确认就发送命令。
- **做法**：注入函数返回成功标记；注入后短暂等待；首次失败重试一次；保留关键错误日志。

### 2) SPA 点击漏录
- **根因**：仅依赖 ARIA/refId，动态 DOM 下目标不稳定。
- **做法**：识别原生交互元素（`a/button/input/...`）；refId 失败时向上找交互父节点并直接创建 fingerprint。

### 3) 输入事件缺失或 value 为 null
- **根因**：输入路径没有 fallback，且只处理原生 input。
- **做法**：统一 `recordInputAction`；支持 `contenteditable`；`input + keyup` 双监听；无 refId 时直接建 fingerprint。

### 4) 事件顺序错乱 / 输入冗余
- **根因**：pending input/scroll 与 click/navigate 缺少统一协调。
- **做法**：集中管理 pending 状态；在 click/导航前强制 flush；延长 input debounce 只保留最终输入。

### 6) Playwright 目录锁冲突与 Cookie 注入
- **根因**：使用 `launch_persistent_context` 直接挂载日常 Chrome 目录时，如果日常 Chrome 未关闭，会导致 `lockfile` 冲突报错启动失败。
- **做法**：采用独立 `user_data_dir` 策略（隔离环境），配合 `SessionManager` 通过 JSON 直接注入日常浏览器提取出的 Cookie 绕过单点登录限制。

### 7) Playwright Accessibility 观测与坐标执行
- **根因**：Playwright Python 1.42 移除了 `page.accessibility.snapshot()`；同时常规 DOM 过于庞大且充满无关结构。
- **做法**：
  1. 通过 `page.context.new_cdp_session(page)` 获取底层 CDP `Accessibility.getFullAXTree` 并自行做语义剪枝。
  2. 舍弃原生 Locators，改用 CDP 的 `DOM.getBoxModel` 提取目标 `backendNodeId` 的绝对坐标 $(x,y)$，直接调用 `page.mouse.click(x,y)` 提高操作稳定性与成功率。

### 8) Agent History 注入与大模型 Prompt 缓存机制 (Phase 3 待优化点)
- **根因**：在测试 `ReplayAgent` 的自主循环时，必须注入动作历史（History）才能避免 Agent 死循环点击同一个元素。但如果将不断增长的 history text 直接拼接在 `User Prompt` 的尾部或中间，会导致每次请求的 Prompt 都在变化，**极大地降低了 LLM API 的 Cache 命中率**，增加成本与延迟。
- **做法**：在设计最终的 `WorkflowReplayer` 状态机与 Agent 记忆时，需要将稳定的、不变的指令（如 System Prompt、任务背景）与高频变化的数据（如当前 DOM Snapshot、最近步骤 History）合理分离或分页。确保长文本（如 DOM Tree）能够被有效 Cache。

---

## 排查清单（按顺序）

1. Chrome 扩展后台页是否收到 WebSocket 控制消息。  
2. 目标页面 console 是否出现录制监听挂载日志。  
3. 是否成功发送 `START_RECORDING` / `STOP_RECORDING` 到 tab。  
4. 录制 JSONL 是否包含 metadata + action 行。  
5. action 是否包含 `type/timestamp/pageContext`，点击/输入是否有 `targetHint`。  
6. 快速操作场景下，事件顺序是否为 `type -> click -> navigate`。  

---

## 设计原则（持续遵守）

- **先保可观测性**：不要静默吞错。  
- **先保事件语义**：宁可少记录无意义噪声，也要保证关键事件可回放。  
- **先保回放稳定**：元素定位优先语义 fingerprint，不依赖脆弱 DOM 引用。  
