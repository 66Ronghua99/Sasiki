# P0 Execution Replan (2026-03-03)

## 1. 目标重述

当前阶段不切换到新 Phase。继续停留在 P0，目标只有两条：

1. 不再因 action payload 异常导致硬崩（`navigate value=null`、`target_id` 类型错误等）。
2. Stage 执行能稳定推进，不因“泛化 locator + 过度严格执行”陷入重复失败。

---

## 2. 现状问题（按层分解）

### 2.1 录制/生成层（上游）

1. 已有进展：`navigate` 在生成产物中已补齐 `value`，且 URL 噪声有所下降。
2. 仍有不足：真实页面中的“帖子 link 名称是数字/弱语义”导致下游仅靠 `role+name` 不稳定。

结论：上游不是当前主阻塞，但它提供的目标语义确实偏弱，不能要求执行层“只靠严格 role+name”。

### 2.2 执行层（当前主阻塞）

1. Agent 输出格式存在波动（`target_id` 字符串、`navigate` 无 value 等）。
2. 定位策略退化时会回落到过宽定位（如 `get_by_role("link")`），在真实站点 strict mode 下高概率失败。
3. 失败后重试常重复同类策略，最终被 repetition/stagnation 终止。

结论：当前失败主要在执行层“容错与定位梯度”。

### 2.3 验证层（次阻塞）

1. 部分 run 中，行为已到达目标页，但 done/verifier 文本匹配仍可能误拒绝。
2. 该问题已在既有分析范围内，不作为本轮新增主线，但会影响“是否判定通过”。

---

## 3. 核心矛盾（辩证取舍）

### 矛盾 A：严格性 vs 可执行性

1. 过松：会乱点，产生随机成功/失败。
2. 过严：真实站点弱语义目标无法通过，流程僵死。

策略：
1. 在输入契约上严格（非法 payload 必须先归一或降级）。
2. 在定位执行上分层（多级候选，不是一刀切失败）。

### 矛盾 B：脚本复刻 vs 目标达成

1. 纯复刻会被动态 DOM 打断。
2. 纯目标导向会丢失可追溯性。

策略：
1. 允许“策略切换”（如无法稳定点击时直接导航回目标页）。
2. 但每次切换必须记录来源与理由（为后续 traceability 做准备）。

---

## 4. 重规划（P0 内重排，不改 Phase 顺序）

## 4.1 P0-A: Action Schema Gate（继续收敛）

目标：所有 LLM action 先过统一闸门，非法输入不直接进入执行器。

范围：
1. 数字字符串 `target_id` -> `int`。
2. 非数字字符串 `target_id` -> `target.element_id/test_id`。
3. `navigate` 无 URL -> 不执行，走重采样/降级。

验收：
1. 不再出现 Pydantic 级 payload 崩溃。
2. 失败都转为可追踪的执行失败（非解析异常）。

## 4.2 P0-B: Target Resolution Ladder（本轮重点）

目标：禁止“无约束 link 点击”。

执行优先级：
1. `test_id` / `element_id`
2. `role + name`
3. `target_id`（当前观察周期内有效）
4. role-only 禁止直接执行（直接判不可执行，要求重采样）

验收：
1. 不再出现 `get_by_role("link") resolved to N elements` 作为主要失败模式。
2. Stage2 首次失败后能切换到更窄定位，而非重复 role-only 点击。

## 4.3 P0-C: Retry Policy Rebalance

目标：避免“重复同类失败动作”。

策略：
1. 重试前检测“动作等价类”（action_type + locator 语义）。
2. 连续命中同类失败时强制切换策略（候选定位或直接导航恢复）。

验收：
1. `Action repetition detected` 频率下降。
2. 同一失败原因不重复超过 2 次。

## 4.4 P0-D: Verification Alignment（保持在 P0 尾部）

目标：减少“已达成但 done 被拒”的假阴性。

策略：
1. success_criteria 增加结构化 evidence 提示（URL/可见结果数量/标题）。
2. verifier 先做结构化条件判断，再做文本匹配。

验收：
1. 对同一页面状态，done 判定稳定一致。

---

## 5. 退出条件（P0）

满足以下全部条件才进入下一阶段：

1. 连续 3 次有头 E2E 中，`navigate+value=null` 崩溃为 0。
2. Stage2 不再以 role-only link strict-mode 失败为主因。
3. 至少 2/3 次 run 能完整通过 Stage2（允许策略切换，但需可追溯）。

---

## 6. 非目标（本轮不做）

1. 不做 extension 大改。
2. 不做全量 prompt 重写。
3. 不在本轮清理历史 ruff 债务。

---

## 7. 架构审查（2026-03-03）

### 7.1 困境本质：三个层面的错位

#### 问题一：目标语义与执行语义的错位（核心）

录制层记录的是**元素引用**（数字 ID、hash），但执行层需要**语义目标**。

```
录制产出: click link '287654321'       ← DOM 运行时 ID
执行期待: click 搜索结果中关于春季穿搭的帖子  ← 用户意图
```

`stage_executor.py` 的 `action_details` 把录制时的弱语义 `target_hint` 直接传给 Agent，但 Agent 在当前 DOM 里找不到字面量匹配，于是退化到 role-only。**根本原因不是执行层不够严格，而是上游语义在生成阶段丢失了**。

#### 问题二：Replay 范式 vs Agent 范式的混合错误

系统在两个相互冲突的范式中摇摆：

- **Replay 范式**要求：精确回放录制脚本（需要稳定 selector）
- **Agent 范式**要求：理解目标，在动态页面自主完成（需要语义 intent）

当前架构同时运行两个范式但都做不彻底：目标是模糊的录制残留（弱语义），定位策略是严格的 Playwright locator（强约束），LLM 在不清晰的目标和严格的定位失败中反复。

#### 问题三：补丁累积掩盖了根因

P0 的每个子任务都在治症：

- P0-A: Schema Gate（防止崩溃）
- P0-B: Resolution Ladder（改善定位优先级）
- P0-C: Retry Rebalance（减少重复失败）

但都没有回答核心问题：**LLM 凭什么知道要点哪个元素？**

---

### 7.2 当前各子任务的具体风险点

#### P0-B: Target Resolution Ladder 的真实问题

梯度 `test_id > role+name > target_id > role-only (禁止)` 处理了"如何执行定位"，但前提是 LLM 能给出正确的 `role+name`。

风险在于：

- `BrowserUseObservationProvider` 已经从 `innerText` 提取元素 name（最多 120 字符），信息质量是够的
- 但 `stage_executor.py` L89-98 的 `action_details.target_hint` 携带的是录制时的 DOM 属性（数字 ID）
- LLM 会用录制的弱语义去匹配当前 DOM 的强文本内容，永远字面量匹配不上

```python
# stage_executor.py: action_details 传的是什么？
action_desc += f" on {target_hint}"  # ← 录制时的 target_hint，不是页面可见文本
```

**Resolution Ladder 建好了，但爬梯子的人拿着错误的地址。**

#### P0-C: Retry 的切换目标不清晰

"同类失败不超过 2 次后强制切换策略" — 切换到什么？

目前备选是 direct navigate 到录制时的 URL，但：

- 小红书帖子 URL 包含动态 session 参数，直接导航可能触发重定向或 461 风控
- 如果 URL 可用，为什么 Stage 要求点击，而不在生成阶段就直接 navigate？

切换目标的可行性需要先验证。

#### 观察层与 LLM 的信息不对称

`NORMAL_SYSTEM_PROMPT` 没有明确告诉 LLM：

> 当 goal 要求的元素语义和 DOM 里看到的文本不一致时，优先用 DOM 里的内容语义匹配目标意图，而不是字面量匹配。

LLM 收到 `"click link '287654321'"` 和 DOM 里 `{idx:5, role:'link', name:'超好看的春季穿搭 by xxx'}` — 它不知道这两者是同一个东西，只会报告找不到 `287654321`。

---

### 7.3 解决方案（按优先级）

#### 方向一：修复 target_hint 语义（最高优先）

**定位**：`canonicalizer.py` 和 extension 录制端。

检查 extension 端是否已录制 `targetHint.innerText`（帖子可见标题文本）。若已有，`canonicalizer.py` 的 `target_hint` 应优先使用 `innerText` 而非 `element_id` 或数字 ID。

预期效果：stage prompt 里的 `action_details` 从 `"click link '287654321'"` 变为 `"click link '超好看的春季穿搭推荐'"` — LLM 能语义匹配当前 DOM。

#### 方向二：Stage Objective 携带搜索上下文（中优先）

当前 Stage 2 goal 形如：

```
click link '287654321' (Page: https://www.xiaohongshu.com/search_result/...)
```

应改为：

```
在搜索结果页面点击一个关于"春季穿搭 男"的帖子
success_criteria: URL 跳转到帖子详情页（/explore/ 或 /discovery/item/）
```

`SkillGenerator` 在生成 stage objective 时，应把录制时的搜索关键词（`keyword=春季穿搭男`）和**目标页面特征**带进 goal，而不是带元素 ID。

#### 方向三：提升 System Prompt 的语义匹配指令（低成本）

在 `NORMAL_SYSTEM_PROMPT` 中增加：

```
## Semantic matching
- When the goal references an element by ID or hash, treat it as a hint, not a literal match.
- Match by visible text, content semantics, or page context instead.
- Prefer elements whose name/text aligns with the overall goal intent.
```

#### 方向四：Direct Navigate 从降级兜底提升为并列候选策略

对于小红书等强动态站点，直接导航到目标 URL 是合理主策略，不应只作为 retry 兜底。建议：

- 生成阶段：若 canonical action 记录了明确目标 URL（非纯动态参数），生成 `navigate` 与 `click` 两条并列候选
- 执行阶段：Agent 根据当前 DOM 状态选择，而不是只在失败后才切换

---

### 7.4 行动优先级汇总

| 行动 | 层面 | 工作量 | 预期收益 |
|------|------|--------|---------|
| 确认 extension 是否录制了 `targetHint.innerText` | 录制层 | 极小（只读验证） | 决定方向一是否可行 |
| canonicalizer 的 `target_hint` 使用 innerText 而非 element_id | 生成层 | 小 | 直接解决 P0-B 根因 |
| System Prompt 增加"语义意图匹配 > 字面量匹配"指令 | Agent | 极小 | 中，LLM 更宽容 |
| Stage objective 改为携带搜索关键词 + 目标页面特征 | 生成层 | 中 | 高，减少对精确元素定位的依赖 |

---

## 8. 最新 E2E 证据快照（2026-03-03）

样本：
`/Users/cory/.sasiki/workflows/ddb23bb7-6267-4267-a034-fa11cd2b5628/execution_report_final.json`

运行口径：
1. headed（不使用 `--headless`）
2. `--observation-mode browser_use`
3. `--no-interactive --on-hitl continue --skip-checkpoints`

结果摘要：
1. Stage1：`success`（2 steps）
2. Stage2：`failed`（12 steps, max-steps reached）
3. 报告已包含 `llm_debug_rounds`：Stage1=5 轮，Stage2=21 轮

量化错误分布（同一报告）：
1. `navigate requires URL value`：7 次
2. `press requires value`：2 次
3. LLM parse error：5 次（其中 `done.evidence` 类型不匹配 2 次）

分层结论：
1. 当前主失败点已明确是执行契约层，不是 recording 首要阻塞。
2. 具体是“模型输出字段漂移”导致高频无效动作：
   - `navigate` 输出 `url` 但未映射到 `value`
   - `press` 输出 `key` 但未映射到 `value`
   - `done.evidence` 输出 object 而 schema 要 string
3. Stage2 仍存在观测-定位错位（如 `target_id=1 not found in node map`），但优先级低于上面三类契约错误。

---

## 9. 下一步（按顺序，不跳步）

### 9.1 P0-A2：最小工具化闸门（先做）

目标：把“自由 JSON 文本”收敛为“有限动作 + 严格参数 schema”。

最小动作面：
1. `navigate(url)`
2. `click(target)`
3. `fill(target, text)`
4. `press(key)`
5. `done(evidence_text)`
6. `ask_human(message)`

必须内建的兼容映射（仅 3 条）：
1. `url -> value`（navigate）
2. `key -> value`（press）
3. `evidence(dict) -> evidence_text`（done）

验收：
1. 同口径 E2E 中，`navigate requires URL value = 0`
2. 同口径 E2E 中，`press requires value = 0`
3. 同口径 E2E 中，`done.evidence` 类型 parse error = 0

### 9.2 P0-B：再看定位梯度（后做）

前置条件：9.1 验收通过后再进行。

验收：
1. Stage2 的主失败不再是输入契约异常
2. 再评估 `target_id not found` 与弱语义 link 的处理策略

### 9.3 P0-D：Verifier 对齐（最后）

仅当执行链路可稳定产生有效动作后再做，避免误把执行失败当验证失败。

---

## 10. 固化调试闭环（后续每轮复用）

每次迭代都按同一流程执行：

1. 运行
   - 固定命令口径（headed + `browser_use`）
2. 取证
   - 读取 `execution_report_final.json` 的 `episode_log + llm_debug_rounds`
3. 计数
   - 统计三类契约错误次数（navigate/press/evidence）
4. 判定
   - 先消灭契约错误，再处理定位和 verifier
5. 记录
   - 将本轮结论写回 `PROGRESS.md` 与本文件，不靠记忆推进
| P0-C direct navigate 从兜底提升为并列候选 | 执行层 | 中 | 中，需先验证 URL 有效性 |

**一句话总结**：当前困境源于上游（录制→生成）产出了弱语义的元素引用，导致执行层被迫用精确匹配处理语义模糊问题。P0-B/C 的补丁没有打在真正的缝隙上。最小成本修复是：让 `canonicalizer` 使用 `innerText` 而非 element ID 作为 `target_hint`，让 stage goal 携带搜索上下文。

---

## 8. 落地约束（减法优先）

### 8.1 保留与回滚边界

保留：
1. 已落地的 Schema Gate（`target_id` 字符串归一、`navigate` 缺 URL 拦截）继续保留。
2. 现有 observation/provider 抽象不再扩展，仅按当前接口使用。

回滚/不继续扩展：
1. 不把 extension 当成本轮主修点；除字段缺失 bug 外不改协议。
2. 不引入新的执行层 abstraction、策略树或大规模 prompt 重写。
3. 不将 `direct navigate` 提升为主策略，仅保持 retry 兜底候选。

### 8.2 最小改动顺序（按提交粒度）

M1. 语义提示净化（生成层，小改）
1. `skill_generator` 输出给 stage 的 `target_hint` 改为“可读短语”而不是原始 dict。
2. 优先使用 `role+name`；当 `name` 明显是 ID/hash/纯数字时，不回填 `element_id/test_id` 到提示文本。

M2. 定位收敛（执行层，小改）
1. `replay_agent` 禁止对 `click/fill/hover/assert_visible/extract_text` 执行 role-only locator。
2. 当只有 role 且无 `name/test_id/element_id` 时，直接抛出“不可执行（ambiguous target）”进入 retry，而不是 `get_by_role(role)`。

M3. 重试去重复（执行层，小改）
1. `stage_executor` 在 retry 内新增“动作等价类”检测（`action_type + target语义 + value`）。
2. 同等价类连续失败 >=2 次直接终止当前策略，避免无效重试循环。

### 8.3 本轮验收（不变）

1. 连续 3 次有头 E2E：`navigate + value=null` 崩溃为 0。
2. Stage2 主失败不再是 `get_by_role("link")` strict-mode。
3. 至少 2/3 次 run 能通过 Stage2，且失败可追溯到明确策略原因。
