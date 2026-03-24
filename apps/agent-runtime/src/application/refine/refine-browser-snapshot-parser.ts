/**
 * Deps: domain/refine-react.ts
 * Used By: application/refine/tools/services/refine-browser-service.ts
 * Last Updated: 2026-03-21
 */
import { URL } from "node:url";

import type { BrowserTabIdentity, PageIdentity } from "../../domain/refine-react.js";

export interface SnapshotLineElement {
  role: string;
  elementRef: string;
  rawText: string;
  normalizedText: string;
}

export interface SnapshotMetrics {
  snapshotLineCount: number;
  refBearingElementCount: number;
  textBearingLineCount: number;
  changedMarkerCount: number;
  tabCount: number;
}

export interface ParsedObservationMetadata {
  rawPage?: PageIdentity;
  page?: PageIdentity;
  tabs: BrowserTabIdentity[];
  pageTab?: BrowserTabIdentity;
  taskRelevantTabs: BrowserTabIdentity[];
  activeTabIndex?: number;
  activeTabMatchesPage?: boolean;
  pageIdentityWasRepaired: boolean;
  snapshotMetrics: SnapshotMetrics;
}

export class RefineBrowserSnapshotParser {
  parseObservationMetadata(text: string): ParsedObservationMetadata {
    const lines = text.split("\n");
    const tabs = this.parseOpenTabs(lines);
    const activeTab = tabs.find((tab) => tab.isActive);
    const rawUrl = this.extractLineValue(lines, ["Page URL", "URL"]);
    const rawTitle = this.extractLineValue(lines, ["Page Title", "TITLE"]) ?? activeTab?.title ?? "Unknown";
    const parsedPage = rawUrl
      ? this.pageIdentityFromUrl(rawUrl, rawTitle)
      : activeTab
        ? this.pageIdentityFromUrl(activeTab.url, activeTab.title)
        : undefined;
    const rawPage = parsedPage;
    const page =
      parsedPage && activeTab && !this.urlsEquivalent(activeTab.url, parsedPage.url)
        ? this.pageIdentityFromUrl(activeTab.url, activeTab.title)
        : parsedPage;
    const activeTabIndex = activeTab?.index;
    const activeTabMatchesPage =
      page && activeTab ? this.urlsEquivalent(activeTab.url, page.url) : undefined;
    const pageTab = this.selectPageTab(page, tabs, activeTab);
    const taskRelevantTabs = tabs.filter((tab) => this.isTaskRelevantTab(tab));
    const snapshotMetrics = this.buildSnapshotMetrics(lines, tabs);
    return {
      rawPage,
      page,
      tabs,
      pageTab,
      taskRelevantTabs,
      activeTabIndex,
      activeTabMatchesPage,
      pageIdentityWasRepaired: Boolean(rawPage && page && !this.urlsEquivalent(rawPage.url, page.url)),
      snapshotMetrics,
    };
  }

  parseSnapshotElements(snapshot: string): SnapshotLineElement[] {
    const lines = snapshot.split("\n");
    const elements: SnapshotLineElement[] = [];
    for (const line of lines) {
      const legacy = this.parseLegacySnapshotElement(line);
      if (legacy) {
        elements.push(legacy);
        continue;
      }
      const yaml = this.parseYamlSnapshotElement(line);
      if (yaml) {
        elements.push(yaml);
      }
    }
    return elements;
  }

  pageIdentityFromUrl(urlValue: string, title: string): PageIdentity {
    try {
      const url = new URL(urlValue);
      return {
        url: url.toString(),
        origin: url.origin,
        normalizedPath: url.pathname || "/",
        title: title.trim() || "Unknown",
      };
    } catch {
      return {
        url: urlValue,
        origin: "unknown",
        normalizedPath: "/",
        title: title.trim() || "Unknown",
      };
    }
  }

  private parseOpenTabs(lines: string[]): BrowserTabIdentity[] {
    const tabs: BrowserTabIdentity[] = [];
    for (const line of lines) {
      const entry = line.match(/^\s*-\s*(?<index>\d+)\s*:\s*(?<rest>.+)$/);
      if (!entry?.groups) {
        continue;
      }
      const index = Number.parseInt(entry.groups.index, 10);
      if (!Number.isFinite(index)) {
        continue;
      }
      const rest = entry.groups.rest.trim();
      const link =
        rest.match(/^\(current\)\s+\[(?<title>[^\]]*)\]\((?<url>.*)\)$/) ??
        rest.match(/^\[(?<title>[^\]]*)\]\((?<url>.*)\)\s+\(current\)$/) ??
        rest.match(/^\[(?<title>[^\]]*)\]\((?<url>.*)\)$/);
      if (!link?.groups) {
        continue;
      }
      const title = (link.groups.title ?? "").trim() || "Untitled";
      const url = (link.groups.url ?? "").trim();
      if (!url) {
        continue;
      }
      tabs.push({
        index,
        url,
        title,
        isActive: /\(current\)/i.test(rest),
      });
    }
    return tabs;
  }

  private selectPageTab(
    page: PageIdentity | undefined,
    tabs: BrowserTabIdentity[],
    activeTab: BrowserTabIdentity | undefined,
  ): BrowserTabIdentity | undefined {
    if (activeTab) {
      return activeTab;
    }
    if (!page) {
      return tabs[0];
    }
    return tabs.find((tab) => this.urlsEquivalent(tab.url, page.url)) ?? tabs[0];
  }

  private isTaskRelevantTab(tab: BrowserTabIdentity): boolean {
    const title = tab.title.trim().toLowerCase();
    const url = tab.url.trim().toLowerCase();
    if (!url || url === "about:blank") {
      return false;
    }
    if (title === "untitled" || title === "new tab" || title === "omnibox popup") {
      return false;
    }
    return true;
  }

  private buildSnapshotMetrics(lines: string[], tabs: BrowserTabIdentity[]): SnapshotMetrics {
    const snapshotBody = this.extractSnapshotBody(lines);
    const elements = this.parseSnapshotElements(snapshotBody.join("\n"));
    const structuralLineCount = snapshotBody.filter((line) => line.trim().length > 0).length;
    const textBearingLineCount = elements.filter((element) => element.rawText.trim().length > 0).length;
    const changedMarkerCount = snapshotBody.filter((line) => line.includes("<changed>")).length;
    return {
      snapshotLineCount: structuralLineCount,
      refBearingElementCount: elements.length,
      textBearingLineCount,
      changedMarkerCount,
      tabCount: tabs.length,
    };
  }

  private extractSnapshotBody(lines: string[]): string[] {
    const body: string[] = [];
    let inSnapshotSection = false;
    let inFence = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!inSnapshotSection) {
        if (/^###\s+Snapshot\b/i.test(trimmed)) {
          inSnapshotSection = true;
        }
        continue;
      }
      if (!inFence) {
        if (trimmed.startsWith("```")) {
          inFence = true;
        }
        continue;
      }
      if (trimmed.startsWith("```")) {
        break;
      }
      body.push(line);
    }

    if (body.length > 0) {
      return body;
    }

    return lines.filter((line) => {
      const trimmed = line.trim();
      return this.parseLegacySnapshotElement(trimmed) !== null || this.parseYamlSnapshotElement(trimmed) !== null;
    });
  }

  private extractLineValue(lines: string[], labels: string[]): string | undefined {
    const lowerLabels = labels.map((label) => label.trim().toLowerCase());
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      const normalized = line.startsWith("- ") ? line.slice(2).trim() : line;
      const lower = normalized.toLowerCase();
      for (let index = 0; index < lowerLabels.length; index += 1) {
        const lowerLabel = lowerLabels[index];
        if (!lower.startsWith(`${lowerLabel}:`)) {
          continue;
        }
        const value = normalized.slice(labels[index].length + 1).trim();
        if (value) {
          return value;
        }
      }
    }
    return undefined;
  }

  private urlsEquivalent(left: string, right: string): boolean {
    try {
      return new URL(left).toString() === new URL(right).toString();
    } catch {
      return left.trim() === right.trim();
    }
  }

  private parseLegacySnapshotElement(line: string): SnapshotLineElement | null {
    const match = line.match(/^\[(?<role>[^|\]]+)\|(?<ref>[^\]]+)\]\s*(?<text>.*)$/);
    if (!match?.groups) {
      return null;
    }
    const rawText = (match.groups.text ?? "").trim();
    return {
      role: (match.groups.role ?? "").trim().toLowerCase(),
      elementRef: (match.groups.ref ?? "").trim(),
      rawText,
      normalizedText: rawText.toLowerCase(),
    };
  }

  private parseYamlSnapshotElement(line: string): SnapshotLineElement | null {
    const match = line.match(
      /^\s*-\s*(?:<changed>\s*)?(?<role>[^\[\]":]+?)(?:\s+"(?<quoted>[^"]*)")?(?:\s+\[[^\]]+\])*?\s+\[ref=(?<ref>[^\]\s]+)\](?:\s+\[[^\]]+\])*\s*:?\s*(?<tail>.*)$/
    );
    if (!match?.groups) {
      return null;
    }
    const role = (match.groups.role ?? "").trim().toLowerCase();
    const elementRef = (match.groups.ref ?? "").trim();
    if (!role || !elementRef) {
      return null;
    }
    const tail = (match.groups.tail ?? "").trim();
    const quoted = (match.groups.quoted ?? "").trim();
    const rawText = tail || quoted;
    return {
      role,
      elementRef,
      rawText,
      normalizedText: rawText.toLowerCase(),
    };
  }
}
