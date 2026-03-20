/**
 * Deps: domain/refine-react.ts
 * Used By: runtime/replay-refinement/refine-browser-tools.ts
 * Last Updated: 2026-03-20
 */
import { URL } from "node:url";

import type { BrowserTabIdentity, PageIdentity } from "../../domain/refine-react.js";

export interface SnapshotLineElement {
  role: string;
  elementRef: string;
  rawText: string;
  normalizedText: string;
}

export interface ParsedObservationMetadata {
  page?: PageIdentity;
  tabs: BrowserTabIdentity[];
  activeTabIndex?: number;
  activeTabMatchesPage?: boolean;
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
    const page =
      parsedPage && activeTab && !this.urlsEquivalent(activeTab.url, parsedPage.url)
        ? this.pageIdentityFromUrl(activeTab.url, activeTab.title)
        : parsedPage;
    const activeTabIndex = activeTab?.index;
    const activeTabMatchesPage =
      page && activeTab ? this.urlsEquivalent(activeTab.url, page.url) : undefined;
    return {
      page,
      tabs,
      activeTabIndex,
      activeTabMatchesPage,
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
      const link = rest.match(/\[(?<title>[^\]]*)\]\((?<url>[^)]+)\)/);
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
