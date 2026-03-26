import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { ObservePageResponse, PageObservation } from "../../../../domain/refine-react.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserService } from "../services/refine-browser-service.js";

const OBSERVE_PAGE_DESCRIPTION =
  "Capture a fresh stabilized page snapshot with readiness state and derived task-facing tab views, and mint a new observationRef. Call this after navigation, tab switches, or other page-changing actions before further structural reasoning. Set includeSnapshot=false to keep the latest snapshot for observe.query without returning full snapshot text to you.";
const OBSERVE_PAGE_SCHEMA = {
  type: "object",
  properties: {
    includeSnapshot: { type: "boolean" },
  },
  required: [],
  additionalProperties: false,
} as const;

export const observePageTool: RefineToolDefinition = {
  name: "observe.page",
  description: OBSERVE_PAGE_DESCRIPTION,
  inputSchema: OBSERVE_PAGE_SCHEMA,
  async invoke(args, context) {
    const includeSnapshot = readOptionalBooleanArg(args, "includeSnapshot");
    const observed = await readBrowserService(context).capturePageObservation();
    if (includeSnapshot === false) {
      return omitSnapshotFromResponse(observed) as unknown as ToolCallResult;
    }
    return observed as unknown as ToolCallResult;
  },
};

function readBrowserService(context: RefineToolContext): RefineBrowserService {
  const browserService = context.browserService;
  if (
    !browserService ||
    typeof browserService !== "object" ||
    typeof (browserService as RefineBrowserService).capturePageObservation !== "function"
  ) {
    throw new Error("refine browser service is required");
  }
  return browserService as RefineBrowserService;
}

function readOptionalBooleanArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`invalid argument: ${key}`);
  }
  return value;
}

type ObservePageToolResponse = {
  observation: Omit<PageObservation, "snapshot"> & { snapshot?: string };
};

function omitSnapshotFromResponse(response: ObservePageResponse): ObservePageToolResponse {
  return {
    observation: omitObservationSnapshot(response.observation),
  };
}

function omitObservationSnapshot(observation: PageObservation): ObservePageToolResponse["observation"] {
  const { snapshot: _snapshot, ...rest } = observation;
  return rest;
}
