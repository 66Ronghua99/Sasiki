const PRESET_COMPACT_SCRIPTED_REPLIES = {
  "tiktok-shop-customer-service": [
    "复用这条流程时，必须先进入客服消息页，再检查已分配、未分配和未读相关视图。不能只停留在主页，也不能只根据导航角标判断是否有消息。",
    "如果消息页里没有任何会话，或者所有消息状态计数都是 0，要明确记录空状态后结束；只有发现真实会话时才继续阅读或处理。",
    "在消息页内部，已分配和未分配是会话列表上方的 tabs，未读是状态筛选区里的“未读”选项。",
    "检查标准以消息页实际列表和筛选结果为准：看已分配/未分配 tabs 和未读筛选下是否出现真实会话卡片，不能以主页角标或导航提示代替。",
    "即使示教主要记录了导航，也要把可复用能力收敛为：进入 /chat/inbox/current，检查已分配、未分配、未读三个视图，若都为空则总结空状态，否则继续阅读或处理真实会话。",
    "当前不用补充新示教，先按这些固定入口、判断标准和停止条件产出可复用 skill。",
  ],
};

export function resolveCompactScriptedReplies({ explicitReplies, autoObserve, observePreset }) {
  const explicit = explicitReplies?.trim();
  if (explicit) {
    return explicit;
  }
  if (!autoObserve) {
    return undefined;
  }
  const presetReplies = PRESET_COMPACT_SCRIPTED_REPLIES[String(observePreset ?? "").trim()];
  if (!presetReplies) {
    return undefined;
  }
  return JSON.stringify(presetReplies);
}
