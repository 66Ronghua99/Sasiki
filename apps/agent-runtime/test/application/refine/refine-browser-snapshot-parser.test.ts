import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RefineBrowserSnapshotParser } from "../../../src/application/refine/refine-browser-snapshot-parser.js";

const parser = new RefineBrowserSnapshotParser();
const corpusDir = new URL("./fixtures/browser-snapshot-corpus/", import.meta.url);

function readCorpus(name: string): string {
  return readFileSync(new URL(`${name}.md`, corpusDir), "utf8");
}

function tabSummary(metadata: ReturnType<RefineBrowserSnapshotParser["parseObservationMetadata"]>) {
  return metadata.tabs.map((tab) => ({
    index: tab.index,
    title: tab.title,
    url: tab.url,
    isActive: tab.isActive,
  }));
}

test("parses stable content pages with raw tabs, derived tab views, and ref-bearing elements", () => {
  const metadata = parser.parseObservationMetadata(readCorpus("playwright-home-stable"));
  const elements = parser.parseSnapshotElements(readCorpus("playwright-home-stable"));

  assert.deepEqual(
    tabSummary(metadata),
    [
      { index: 0, title: "Example Domain", url: "https://example.org/", isActive: true },
      { index: 1, title: "Modal Demo", url: metadata.tabs[1].url, isActive: false },
      { index: 2, title: "Untitled", url: "about:blank", isActive: false },
    ],
  );
  assert.equal(metadata.page?.url, "https://example.org/");
  assert.equal(metadata.page?.origin, "https://example.org");
  assert.equal(metadata.page?.normalizedPath, "/");
  assert.equal(metadata.page?.title, "Example Domain");
  assert.equal(metadata.rawPage?.url, "https://example.org/");
  assert.deepEqual(metadata.pageTab, metadata.tabs[0]);
  assert.deepEqual(metadata.taskRelevantTabs.map((tab) => tab.title), ["Example Domain", "Modal Demo"]);
  assert.deepEqual(metadata.snapshotMetrics, {
    snapshotLineCount: 6,
    refBearingElementCount: 5,
    textBearingLineCount: 3,
    changedMarkerCount: 0,
    tabCount: 3,
  });
  assert.deepEqual(elements.map((element) => element.elementRef), ["e2", "e3", "e4", "e5", "e6"]);
  assert.equal(metadata.activeTabIndex, 0);
  assert.equal(metadata.activeTabMatchesPage, true);
  assert.equal(metadata.pageIdentityWasRepaired, false);
});

test("repairs a stale Page URL through the active tab identity and keeps noise tabs raw", () => {
  const metadata = parser.parseObservationMetadata(readCorpus("multi-tab-stale-page-url"));

  assert.equal(metadata.rawPage?.url, "https://example.com/");
  assert.equal(metadata.page?.url, "https://example.org/");
  assert.equal(metadata.page?.origin, "https://example.org");
  assert.equal(metadata.page?.normalizedPath, "/");
  assert.equal(metadata.page?.title, "Example Domain");
  assert.deepEqual(metadata.pageTab, metadata.tabs[0]);
  assert.deepEqual(metadata.tabs.map((tab) => tab.url), ["https://example.org/", metadata.tabs[1].url, "about:blank"]);
  assert.deepEqual(metadata.taskRelevantTabs.map((tab) => tab.title), ["Example Domain", "Modal Demo"]);
  assert.deepEqual(metadata.snapshotMetrics, {
    snapshotLineCount: 6,
    refBearingElementCount: 5,
    textBearingLineCount: 3,
    changedMarkerCount: 0,
    tabCount: 3,
  });
  assert.equal(metadata.activeTabIndex, 0);
  assert.equal(metadata.activeTabMatchesPage, true);
  assert.equal(metadata.pageIdentityWasRepaired, true);
});

test("parses changed snapshot lines and keeps modal refs intact", () => {
  const metadata = parser.parseObservationMetadata(readCorpus("modal-overlay-changed"));
  const elements = parser.parseSnapshotElements(readCorpus("modal-overlay-changed"));

  assert.equal(metadata.page?.title, "Modal Demo");
  assert.equal(metadata.page?.origin, "null");
  assert.equal(metadata.page?.normalizedPath, "text/html,%3C!doctype%20html%3E%3Chtml%20lang%3D'en'%3E%3Chead%3E%3Cmeta%20charset%3D'utf-8'%3E%3Ctitle%3EModal%20Demo%3C/title%3E%3Cstyle%3Ebody%7Bfont-family%3Asans-serif%3Bmargin%3A24px%3B%7D%23modal%7Bposition%3Afixed%3Btop%3A20%25%3Bleft%3A20%25%3Bpadding%3A16px%3Bbackground%3Awhite%3Bborder%3A1px%20solid%20%23999%3Bbox-shadow%3A0%208px%2024px%20rgba(0%2C0%2C0%2C.2)%3Bdisplay%3Anone%3B%7D%23backdrop%7Bposition%3Afixed%3Binset%3A0%3Bbackground%3Argba(0%2C0%2C0%2C.3)%3Bdisplay%3Anone%3B%7D%23modal.open%2C%23backdrop.open%7Bdisplay%3Ablock%3B%7D%3C/style%3E%3Cscript%3Efunction%20openModal()%7Bdocument.getElementById('modal').classList.add('open')%3Bdocument.getElementById('backdrop').classList.add('open')%3Bdocument.getElementById('status').textContent%3D'Modal%20open'%3B%7D%3C/script%3E%3C/head%3E%3Cbody%3E%3Ch1%3EModal%20Demo%3C/h1%3E%3Cp%20id%3D'status'%3EReady%3C/p%3E%3Cbutton%20id%3D'open'%20onclick%3D'openModal()'%3EOpen%20modal%3C/button%3E%3Cdiv%20id%3D'backdrop'%20aria-hidden%3D'true'%3E%3C/div%3E%3Cdiv%20id%3D'modal'%20role%3D'dialog'%20aria-modal%3D'true'%20aria-label%3D'Filters'%3E%3Cstrong%3EFilters%3C/strong%3E%3Cp%3EApply%20filters%20before%20continuing.%3C/p%3E%3Cbutton%3EClose%3C/button%3E%3C/div%3E%3C/body%3E%3C/html%3E");
  assert.equal(metadata.pageTab?.title, "Modal Demo");
  assert.deepEqual(metadata.taskRelevantTabs.map((tab) => tab.title), ["Example Domain", "Modal Demo"]);
  assert.deepEqual(metadata.snapshotMetrics, {
    snapshotLineCount: 8,
    refBearingElementCount: 7,
    textBearingLineCount: 6,
    changedMarkerCount: 1,
    tabCount: 3,
  });
  assert.deepEqual(
    elements.map((element) => ({ role: element.role, elementRef: element.elementRef })),
    [
      { role: "generic", elementRef: "e1" },
      { role: "paragraph", elementRef: "e3" },
      { role: "button", elementRef: "e4" },
      { role: "dialog", elementRef: "e6" },
      { role: "strong", elementRef: "e7" },
      { role: "paragraph", elementRef: "e8" },
      { role: "button", elementRef: "e9" },
    ],
  );
  assert.equal(metadata.activeTabIndex, 1);
  assert.equal(metadata.activeTabMatchesPage, true);
  assert.equal(metadata.pageIdentityWasRepaired, true);
});

test("handles shell-only thin pages without losing raw tabs or empty snapshots", () => {
  const metadata = parser.parseObservationMetadata(readCorpus("shell-only-thin-page"));
  const elements = parser.parseSnapshotElements(readCorpus("shell-only-thin-page"));

  assert.equal(metadata.page?.url, "about:blank");
  assert.equal(metadata.page?.origin, "null");
  assert.equal(metadata.page?.normalizedPath, "blank");
  assert.equal(metadata.page?.title, "Untitled");
  assert.deepEqual(metadata.pageTab, metadata.tabs[2]);
  assert.deepEqual(metadata.taskRelevantTabs.map((tab) => tab.title), ["Example Domain", "Modal Demo"]);
  assert.deepEqual(metadata.snapshotMetrics, {
    snapshotLineCount: 0,
    refBearingElementCount: 0,
    textBearingLineCount: 0,
    changedMarkerCount: 0,
    tabCount: 3,
  });
  assert.deepEqual(elements, []);
  assert.equal(metadata.activeTabIndex, 2);
  assert.equal(metadata.activeTabMatchesPage, true);
  assert.equal(metadata.pageIdentityWasRepaired, true);
});

test("keeps a weak but correct business page parseable while snapshot content stays sparse", () => {
  const metadata = parser.parseObservationMetadata(readCorpus("partial-business-page-weak"));
  const elements = parser.parseSnapshotElements(readCorpus("partial-business-page-weak"));

  assert.equal(metadata.page?.title, "Customer Service Inbox");
  assert.equal(metadata.pageTab?.title, "Customer Service Inbox");
  assert.deepEqual(metadata.taskRelevantTabs.map((tab) => tab.title), ["Customer Service Inbox"]);
  assert.deepEqual(metadata.snapshotMetrics, {
    snapshotLineCount: 6,
    refBearingElementCount: 6,
    textBearingLineCount: 4,
    changedMarkerCount: 0,
    tabCount: 1,
  });
  assert.deepEqual(
    elements.map((element) => ({ role: element.role, elementRef: element.elementRef })),
    [
      { role: "generic", elementRef: "e1" },
      { role: "generic", elementRef: "e2" },
      { role: "complementary", elementRef: "e3" },
      { role: "button", elementRef: "e4" },
      { role: "button", elementRef: "e5" },
      { role: "main", elementRef: "e6" },
    ],
  );
  assert.equal(metadata.activeTabIndex, 0);
  assert.equal(metadata.activeTabMatchesPage, true);
  assert.equal(metadata.pageIdentityWasRepaired, false);
});

test("parses legacy tab suffix shapes and falls back to legacy snapshot lines for metrics", () => {
  const legacy = [
    "### Open tabs",
    "- 0: [Legacy Article](data:text/html,hello) (current)",
    "### Page",
    "- Page URL: data:text/html,hello",
    "- Page Title: Legacy Article",
    "[generic|e1] Legacy body",
  ].join("\n");
  const metadata = parser.parseObservationMetadata(legacy);
  const elements = parser.parseSnapshotElements(legacy);

  assert.equal(metadata.tabs[0].title, "Legacy Article");
  assert.equal(metadata.tabs[0].url, "data:text/html,hello");
  assert.equal(metadata.tabs[0].isActive, true);
  assert.equal(metadata.page?.title, "Legacy Article");
  assert.equal(metadata.pageTab?.title, "Legacy Article");
  assert.equal(metadata.pageIdentityWasRepaired, false);
  assert.deepEqual(metadata.snapshotMetrics, {
    snapshotLineCount: 1,
    refBearingElementCount: 1,
    textBearingLineCount: 1,
    changedMarkerCount: 0,
    tabCount: 1,
  });
  assert.deepEqual(elements.map((element) => element.elementRef), ["e1"]);
});
