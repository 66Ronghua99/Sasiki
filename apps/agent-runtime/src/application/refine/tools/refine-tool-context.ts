import type { RefineBrowserService } from "./services/refine-browser-service.js";
import type { RefineRunService } from "./services/refine-run-service.js";
import type { RefineSkillService } from "./services/refine-skill-service.js";

export interface RefineToolContext {
  readonly browserService?: RefineBrowserService;
  readonly runService?: RefineRunService;
  readonly skillService?: RefineSkillService;
}

export interface RefineToolContextRef<TContext extends RefineToolContext = RefineToolContext> {
  get(): TContext;
  set(context: TContext): void;
}

class MutableRefineToolContextRef<TContext extends RefineToolContext> implements RefineToolContextRef<TContext> {
  private currentContext: TContext;

  constructor(initialContext: TContext) {
    this.currentContext = initialContext;
  }

  get(): TContext {
    return this.currentContext;
  }

  set(context: TContext): void {
    this.currentContext = context;
  }
}

export function createRefineToolContextRef<TContext extends RefineToolContext>(
  initialContext: TContext
): RefineToolContextRef<TContext> {
  return new MutableRefineToolContextRef(initialContext);
}
