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

### 5) target_hint 信息太弱
- **根因**：现代站点大量非语义元素，accessible name 为空。
- **做法**：多层 fallback（子元素文本/alt、父层语义、兄弟上下文、testId/关键 class/id）。

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
