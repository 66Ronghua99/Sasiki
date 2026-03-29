import assert from "node:assert/strict";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, test } from "vitest";
import { CompactForm } from "../../renderer/src/components/workflows/compact-form";
import { findButtonByText, findElementsByTag, setupRendererHarness, submitForm } from "./dom-test-harness";

describe("CompactForm client rendering", () => {
  let harness: ReturnType<typeof setupRendererHarness> | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }

    harness?.cleanup();
    harness = null;
  });

  test("blocks empty submissions when no observe run is selected", async () => {
    harness = setupRendererHarness();
    const activeHarness = harness;
    root = createRoot(activeHarness.container as unknown as Element);

    const submitted: Array<{ sourceRunId: string }> = [];

    await act(async () => {
      root?.render(
        <CompactForm
          observeRuns={[]}
          onSubmit={(input) => {
            submitted.push({ sourceRunId: input.sourceRunId });
          }}
        />,
      );
      await Promise.resolve();
    });

    const submitButton = findButtonByText(activeHarness.container, "Start SOP Compact");
    assert.equal(submitButton.disabled, true);

    await act(async () => {
      submitForm(findElementsByTag(activeHarness.container, "form")[0]);
      await Promise.resolve();
    });

    assert.deepEqual(submitted, []);
  });
});
