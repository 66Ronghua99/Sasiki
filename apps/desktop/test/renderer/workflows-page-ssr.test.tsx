import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowsPage } from "../../renderer/src/routes/WorkflowsPage";

describe("renderer page SSR", () => {
  test("renders workflows page with initial props without a live desktop bridge", () => {
    assert.doesNotThrow(() =>
      renderToStaticMarkup(
        <WorkflowsPage initialAccounts={[]} initialRuns={[]} initialSkills={[]} />,
      ),
    );
  });
});
