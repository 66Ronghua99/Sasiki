import { actClickTool } from "./definitions/act-click-tool.js";
import { actFileUploadTool } from "./definitions/act-file-upload-tool.js";
import { actNavigateTool } from "./definitions/act-navigate-tool.js";
import { actPressTool } from "./definitions/act-press-tool.js";
import { actScreenshotTool } from "./definitions/act-screenshot-tool.js";
import { actSelectTabTool } from "./definitions/act-select-tab-tool.js";
import { actTypeTool } from "./definitions/act-type-tool.js";
import { observePageTool } from "./definitions/observe-page-tool.js";
import { observeQueryTool } from "./definitions/observe-query-tool.js";
import { RefineToolRegistry } from "./refine-tool-registry.js";

export function createRefineBrowserToolRegistry(): RefineToolRegistry {
  return new RefineToolRegistry({
    definitions: [
      observePageTool,
      observeQueryTool,
      actClickTool,
      actTypeTool,
      actPressTool,
      actNavigateTool,
      actSelectTabTool,
      actScreenshotTool,
      actFileUploadTool,
    ],
  });
}
