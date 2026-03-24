import type { ToolCallResult, ToolClient } from "../../../../contracts/tool-client.js";
import type {
  ActionExecutionResult,
  BrowserTabIdentity,
  ObserveQueryRequest,
  PageIdentity,
  PageObservation,
} from "../../../../domain/refine-react.js";
import type { RefineReactSession } from "../../refine-react-session.js";
import {
  RefineBrowserSnapshotParser,
  type ParsedObservationMetadata,
} from "../../refine-browser-snapshot-parser.js";

interface ActionResultOptions {
  targetElementRef?: string;
  page?: PageIdentity;
  fallbackPage?: PageIdentity;
  tabs?: BrowserTabIdentity[];
  activeTabIndex?: number;
  success?: boolean;
  message?: string;
  evidenceRef?: string;
}

export function filterSnapshotLines(
  parser: RefineBrowserSnapshotParser,
  observation: PageObservation,
  request: ObserveQueryRequest,
): Array<{
  elementRef: string;
  sourceObservationRef: string;
  role: string;
  rawText: string;
  normalizedText: string;
}> {
  const candidates = parser.parseSnapshotElements(observation.snapshot).map((item) => ({
    elementRef: item.elementRef,
    sourceObservationRef: observation.observationRef,
    role: item.role,
    rawText: item.rawText,
    normalizedText: item.normalizedText,
  }));

  const filtered = candidates.filter((candidate) => matchesQueryFilter(candidate, request));
  const limited = Number.isFinite(request.limit) && (request.limit ?? 0) > 0 ? filtered.slice(0, request.limit) : filtered;
  return limited;
}

function matchesQueryFilter(
  match: { elementRef: string; role: string; normalizedText: string },
  request: ObserveQueryRequest,
): boolean {
  if (request.mode === "inspect") {
    if (!request.elementRef?.trim()) {
      return false;
    }
    return match.elementRef === request.elementRef.trim();
  }
  if (request.role?.trim()) {
    if (match.role !== request.role.trim().toLowerCase()) {
      return false;
    }
  }
  if (request.text?.trim()) {
    const text = request.text.trim().toLowerCase();
    if (!match.normalizedText.includes(text)) {
      return false;
    }
  }
  return true;
}

export function readToolText(result: ToolCallResult): string {
  if (typeof result === "string") {
    return result;
  }
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const text = (block as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) {
        return text;
      }
    }
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

export function resolveActionSuccess(raw: ToolCallResult, message: string): boolean {
  if (raw.isError === true) {
    return false;
  }
  if (isFailureText(message)) {
    return false;
  }
  return true;
}

function isFailureText(message: string): boolean {
  return /\"isError\"\s*:\s*true/.test(message) || /###\s*Error\b/i.test(message);
}

export function isScreenshotFailure(raw: ToolCallResult, message: string): boolean {
  return raw.isError === true || isFailureText(message);
}

export function requireSourceObservation(session: RefineReactSession, sourceObservationRef: string): PageObservation {
  const observation = session.findObservation(sourceObservationRef);
  if (!observation) {
    throw new Error(`unknown sourceObservationRef: ${sourceObservationRef}`);
  }
  return observation;
}

async function readLiveTabs(rawClient: ToolClient, parser: RefineBrowserSnapshotParser): Promise<BrowserTabIdentity[]> {
  try {
    const tools = await rawClient.listTools();
    const names = new Set(tools.map((tool) => tool.name));
    if (!names.has("browser_tabs")) {
      return [];
    }
    const result = await rawClient.callTool("browser_tabs", { action: "list" });
    const metadata = parser.parseObservationMetadata(readToolText(result));
    return metadata.tabs;
  } catch {
    return [];
  }
}

export async function assertActionSourceContext(
  rawClient: ToolClient,
  parser: RefineBrowserSnapshotParser,
  session: RefineReactSession,
  sourceObservationRef: string,
): Promise<PageObservation> {
  const sourceObservation = requireSourceObservation(session, sourceObservationRef);
  const sourceActiveTabIndex = sourceObservation.activeTabIndex;
  if (typeof sourceActiveTabIndex !== "number") {
    return sourceObservation;
  }
  const liveTabs = await readLiveTabs(rawClient, parser);
  const liveActiveTab = liveTabs.find((tab) => tab.isActive);
  if (!liveActiveTab) {
    return sourceObservation;
  }
  if (liveActiveTab.index !== sourceActiveTabIndex) {
    throw new Error(
      `sourceObservationRef ${sourceObservationRef} tab mismatch: observed active tab ${sourceActiveTabIndex}, current active tab ${liveActiveTab.index}. call act.select_tab or observe.page before acting`,
    );
  }
  return sourceObservation;
}

export function toActionResult(
  latestObservation: PageObservation | undefined,
  parser: RefineBrowserSnapshotParser,
  action: ActionExecutionResult["action"],
  sourceObservationRef: string,
  options: ActionResultOptions,
): ActionExecutionResult {
  return {
    action,
    success: options.success ?? true,
    sourceObservationRef,
    targetElementRef: options.targetElementRef,
    page:
      options.page ?? latestObservation?.page ?? options.fallbackPage ?? parser.pageIdentityFromUrl("about:blank", "Unknown"),
    tabs: options.tabs && options.tabs.length > 0 ? options.tabs : latestObservation?.tabs,
    activeTabIndex:
      typeof options.activeTabIndex === "number" ? options.activeTabIndex : latestObservation?.activeTabIndex,
    evidenceRef: options.evidenceRef,
    message: options.message,
  };
}

export function buildScreenshotArgs(
  args: {
    fullPage?: boolean;
    filename?: string;
  },
  options: {
    includeTypeMode: "always" | "optional" | "never";
  },
): Record<string, unknown>[] {
  const base: Record<string, unknown> = {};
  if (typeof args.fullPage === "boolean") {
    base.fullPage = args.fullPage;
  }

  const filename = args.filename?.trim();
  const pathVariants: Array<Record<string, unknown>> =
    typeof filename === "string" && filename.length > 0
      ? [
          { ...base, filename },
          { ...base, path: filename },
          { ...base, filePath: filename },
        ]
      : [{ ...base }];

  const variants: Record<string, unknown>[] = [];
  for (const variant of pathVariants) {
    if (options.includeTypeMode === "always" || options.includeTypeMode === "optional") {
      variants.push({ ...variant, type: "png" });
    }
    if (options.includeTypeMode === "optional" || options.includeTypeMode === "never") {
      variants.push(variant);
    }
  }
  return uniqueArgs(variants);
}

function uniqueArgs(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const output: Record<string, unknown>[] = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

export function readScreenshotEvidenceRef(args: Record<string, unknown>): string | undefined {
  for (const key of ["filename", "path", "filePath"] as const) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}
