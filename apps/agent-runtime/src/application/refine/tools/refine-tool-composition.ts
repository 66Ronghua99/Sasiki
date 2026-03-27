import type { ToolClient } from "../../../contracts/tool-client.js";
import type { PiAgentToolHookRegistry } from "../../../kernel/pi-agent-tool-hooks.js";
import { createRefineReactSession, type RefineReactSession } from "../refine-react-session.js";
import type { AttentionGuidanceLoader } from "../attention-guidance-loader.js";
import { createRefineBrowserToolRegistry } from "./refine-browser-tool-registry.js";
import { createRefineRuntimeToolRegistry } from "./refine-runtime-tool-registry.js";
import { RefineToolRegistry } from "./refine-tool-registry.js";
import { createRefineToolContextRef, type RefineToolContext, type RefineToolContextRef } from "./refine-tool-context.js";
import { createRefinePiAgentToolHooks } from "./refine-pi-agent-tool-hooks.js";
import { RefineToolSurface } from "./refine-tool-surface.js";
import { RefineToolSurfaceLifecycleCoordinator } from "./refine-tool-surface-lifecycle.js";
import {
  RefineBrowserServiceImpl,
  type RefineBrowserService,
} from "./services/refine-browser-service.js";
import {
  RefineRunServiceImpl,
  type HitlAnswerProvider,
  type RefineRunService,
} from "./services/refine-run-service.js";
import {
  RefineSkillServiceImpl,
  type RefineSkillService,
  type RefineSkillStorePort,
} from "./services/refine-skill-service.js";
import { createRefineToolHookPipeline, type RefineToolHookPipeline } from "./refine-tool-hook-pipeline.js";

export interface RefineToolCompositionContext extends RefineToolContext {
  browserService?: RefineBrowserService;
  runService?: RefineRunService;
  skillService?: RefineSkillService;
}

export interface RefineToolCompositionInput {
  rawClient?: ToolClient;
  rawToolClient?: ToolClient;
  session?: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
  guidanceLoader?: Pick<AttentionGuidanceLoader, "load">;
  knowledgeTopN?: number;
  skillStore?: RefineSkillStorePort;
}

export interface RefineToolComposition {
  contextRef: RefineToolContextRef<RefineToolCompositionContext>;
  registry: RefineToolRegistry;
  surface: RefineToolSurface<RefineToolCompositionContext>;
  hookPipeline: RefineToolHookPipeline<RefineToolCompositionContext, undefined>;
  toolHooks: PiAgentToolHookRegistry;
}

export function createRefineToolComposition(input: RefineToolCompositionInput): RefineToolComposition {
  const rawClient = input.rawToolClient ?? input.rawClient;
  if (!rawClient) {
    throw new Error("refine tool composition requires raw tool client");
  }
  const session =
    input.session ?? createRefineReactSession("bootstrap", "bootstrap", { taskScope: "bootstrap" });
  const contextRef = createRefineToolContextRef<RefineToolCompositionContext>({});
  const browserService = new RefineBrowserServiceImpl({
    rawClient,
    session,
    guidanceLoader: input.guidanceLoader,
    knowledgeTopN: input.knowledgeTopN,
  });
  const runService = new RefineRunServiceImpl({
    session,
    hitlAnswerProvider: input.hitlAnswerProvider,
  });
  const skillService = input.skillStore ? new RefineSkillServiceImpl({ skillStore: input.skillStore }) : undefined;
  contextRef.set({
    browserService,
    runService,
    skillService,
  });

  const registry = new RefineToolRegistry({
    definitions: [
      ...createRefineBrowserToolRegistry().listDefinitions(),
      ...createRefineRuntimeToolRegistry({
        includeSkillReader: Boolean(skillService),
      }).listDefinitions(),
    ],
  });
  const hookPipeline = createNoOpHookPipeline();
  const toolHooks = createRefinePiAgentToolHooks({
    registry,
    pipeline: hookPipeline,
    resolveContext() {
      return contextRef.get();
    },
  });
  const surface = new RefineToolSurface({
    registry,
    contextRef,
    lifecycle: new RefineToolSurfaceLifecycleCoordinator({
      participants: [rawClient],
    }),
  });

  return {
    contextRef,
    registry,
    surface,
    hookPipeline,
    toolHooks,
  };
}

export function createBootstrapRefineToolComposition(
  rawClient: ToolClient,
  options: Pick<RefineToolCompositionInput, "guidanceLoader" | "knowledgeTopN" | "skillStore"> = {},
): RefineToolComposition {
  return createRefineToolComposition({
    rawToolClient: rawClient,
    guidanceLoader: options.guidanceLoader,
    knowledgeTopN: options.knowledgeTopN,
    skillStore: options.skillStore,
  });
}

function createNoOpHookPipeline(): RefineToolHookPipeline<RefineToolCompositionContext, undefined> {
  return createRefineToolHookPipeline<RefineToolCompositionContext, undefined>({
    async beforeToolCall() {
      return undefined;
    },
    async afterToolCall(_call, beforeCapture) {
      return beforeCapture;
    },
  });
}
