/**
 * Deps: domain/sop-compact-artifacts.ts, domain/sop-compact-artifacts-v1.ts
 * Used By: runtime/sop-compact-clarification.ts, runtime/sop-intent-abstraction-builder.ts
 * Last Updated: 2026-03-10
 */
import type {
  IntentResolutionCoreField,
  RejectedClarificationAnswer,
  RejectedAnswerReasonCode,
} from "../domain/sop-compact-artifacts.js";
import type { SemanticCoreFieldKey } from "../domain/sop-compact-artifacts-v1.js";

const PLACEHOLDER_FRAGMENTS = [
  "后续再给",
  "后续给出",
  "后续指令给出",
  "暂时不确定",
  "先这样",
  "之后补充",
  "待定",
  "你先猜",
  "先按你理解",
  "后面再说",
  "稍后补充",
  "差不多就行",
  "先看看",
];

const ACTION_CUES = [
  "搜索",
  "查找",
  "浏览",
  "查看",
  "点赞",
  "关注",
  "汇总",
  "回复",
  "处理",
  "筛选",
  "打开",
  "进入",
  "search",
  "browse",
  "view",
  "like",
  "follow",
  "reply",
  "summarize",
  "open",
  "inspect",
];

const SCOPE_CUES = [
  "单个",
  "一个",
  "多个",
  "多条",
  "多篇",
  "多帖",
  "主页",
  "当前页",
  "当前页面",
  "当前工作区",
  "搜索结果",
  "结果页",
  "帖子",
  "笔记",
  "博主",
  "候选",
  "profile",
  "post",
  "posts",
  "page",
  "workspace",
  "search result",
];

const COMPLETION_CUES = [
  "完成",
  "已",
  "出现",
  "看到",
  "至少",
  "全部",
  "成功",
  "状态",
  "结束",
  "浏览完",
  "处理完",
  "返回",
  "close",
  "done",
  "finished",
  "complete",
  "success",
  "at least",
];

const FINAL_ACTION_CUES = [
  "点赞",
  "关注",
  "回复",
  "提交",
  "发送",
  "保存",
  "点击",
  "浏览",
  "查看",
  "不操作",
  "仅浏览",
  "like",
  "follow",
  "reply",
  "submit",
  "send",
  "save",
  "open",
  "view",
];

export interface CoreFieldAnswerValidation {
  accepted: boolean;
  normalizedValue?: string;
  rejection?: Omit<RejectedClarificationAnswer, "rejectedAt">;
}

export function semanticCoreFieldAliases(field: SemanticCoreFieldKey): string[] {
  switch (field) {
    case "task_intent":
      return ["task_intent", "taskIntentHypothesis", "target_identity"];
    case "scope":
      return ["scope", "scopeHypothesis", "target_scope", "selection_criteria"];
    case "completion_criteria":
      return ["completion_criteria", "completionHypothesis", "done_criteria"];
    case "final_action":
      return ["final_action", "submit_requirement"];
  }
}

export function resolveSemanticCoreFieldKey(value: string | undefined): SemanticCoreFieldKey | undefined {
  switch (value) {
    case "task_intent":
    case "taskIntentHypothesis":
    case "target_identity":
      return "task_intent";
    case "scope":
    case "scopeHypothesis":
    case "target_scope":
    case "selection_criteria":
      return "scope";
    case "completion_criteria":
    case "completionHypothesis":
    case "done_criteria":
      return "completion_criteria";
    case "final_action":
    case "submit_requirement":
      return "final_action";
    default:
      return undefined;
  }
}

export function validateCoreFieldAnswer(
  field: SemanticCoreFieldKey,
  answer: string,
  questionId?: string
): CoreFieldAnswerValidation {
  const normalizedValue = answer.trim();
  const collapsed = normalizeForMatch(normalizedValue);
  if (!normalizedValue) {
    return rejected(field, normalizedValue, "placeholder_phrase", "答案为空，仍不能冻结核心语义字段。", questionId);
  }
  if (containsAny(collapsed, PLACEHOLDER_FRAGMENTS)) {
    return rejected(field, normalizedValue, "placeholder_phrase", "答案仍是占位表述，未提供可执行语义。", questionId);
  }

  switch (field) {
    case "task_intent":
      if (!containsAny(collapsed, ACTION_CUES)) {
        return rejected(
          field,
          normalizedValue,
          "missing_object_and_action",
          "任务目标缺少明确动作语义，仍无法区分是浏览、处理还是其他业务动作。",
          questionId
        );
      }
      break;
    case "scope":
      if (!containsAny(collapsed, SCOPE_CUES)) {
        return rejected(
          field,
          normalizedValue,
          "missing_scope_boundary",
          "范围描述缺少边界信息，仍无法判断是单个对象、当前主页还是多个候选对象。",
          questionId
        );
      }
      break;
    case "completion_criteria":
      if (!containsAny(collapsed, COMPLETION_CUES)) {
        return rejected(
          field,
          normalizedValue,
          "missing_completion_signal",
          "完成条件没有给出可观察的结束信号，仍无法判断何时停止 replay。",
          questionId
        );
      }
      break;
    case "final_action":
      if (!containsAny(collapsed, FINAL_ACTION_CUES)) {
        return rejected(
          field,
          normalizedValue,
          "missing_final_action_decision",
          "最终对象动作仍不明确，无法判断是否需要执行一次对象动作。",
          questionId
        );
      }
      break;
  }

  return {
    accepted: true,
    normalizedValue,
  };
}

export function toRejectedAnswerRecord(
  rejection: Omit<RejectedClarificationAnswer, "rejectedAt">,
  rejectedAt: string
): RejectedClarificationAnswer {
  return {
    ...rejection,
    rejectedAt,
  };
}

function rejected(
  field: IntentResolutionCoreField,
  answer: string,
  reasonCode: RejectedAnswerReasonCode,
  reason: string,
  questionId?: string
): CoreFieldAnswerValidation {
  return {
    accepted: false,
    rejection: {
      questionId,
      field,
      answer,
      reasonCode,
      reason,
    },
  };
}

function normalizeForMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s,，。.!！?？;；:："“”"'‘’()（）[\]【】]/g, "");
}

function containsAny(value: string, candidates: string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate.toLowerCase().replace(/\s+/g, "")));
}
