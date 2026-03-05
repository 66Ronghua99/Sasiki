/**
 * Deps: playwright-core, domain/sop-trace.ts
 * Used By: runtime/agent-runtime.ts
 * Last Updated: 2026-03-05
 */
import type { Browser, BrowserContext, ConsoleMessage, Frame, Page } from "playwright-core";

import type { DemonstrationRawEvent } from "../../domain/sop-trace.js";

export interface ObserveCaptureOptions {
  cdpEndpoint: string;
  timeoutMs: number;
}

interface RawBrowserEvent {
  type: "click" | "input" | "keydown" | "scroll";
  timestamp: number;
  url: string;
  payload: Record<string, unknown>;
}

const OBSERVE_CONSOLE_PREFIX = "__SASIKI_OBSERVE_EVENT__";
const OBSERVE_CAPTURE_SCRIPT = `
(() => {
  const marker = "__sasikiObserveInstalled__";
  if (window[marker]) {
    return;
  }
  window[marker] = true;

  const emit = (event) => {
    try {
      console.debug("${OBSERVE_CONSOLE_PREFIX}" + JSON.stringify(event));
    } catch {}
  };

  const getText = (element) => {
    if (!element || !("textContent" in element)) {
      return "";
    }
    return String(element.textContent || "").trim().slice(0, 120);
  };

  const buildSelector = (element) => {
    if (!(element instanceof Element)) {
      return "";
    }
    if (element.id) {
      return "#" + element.id;
    }
    const parts = [];
    let current = element;
    while (current && parts.length < 5) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      const index = siblings.indexOf(current) + 1;
      parts.unshift(tag + ":nth-of-type(" + index + ")");
      current = parent;
    }
    return parts.join(" > ");
  };

  document.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      emit({
        type: "click",
        timestamp: Date.now(),
        url: location.href,
        payload: {
          selector: buildSelector(target),
          text: getText(target),
          role: target ? target.getAttribute("role") || "" : "",
        },
      });
    },
    true
  );

  document.addEventListener(
    "input",
    (event) => {
      if (!event.isTrusted) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      let value = "";
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        value = target.value || "";
      }
      emit({
        type: "input",
        timestamp: Date.now(),
        url: location.href,
        payload: {
          selector: buildSelector(target),
          text: getText(target),
          value,
        },
      });
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.isTrusted) {
        return;
      }
      emit({
        type: "keydown",
        timestamp: Date.now(),
        url: location.href,
        payload: {
          key: event.key || "",
        },
      });
    },
    true
  );

  let lastScrollTs = 0;
  window.addEventListener(
    "scroll",
    () => {
      const now = Date.now();
      if (now - lastScrollTs < 250) {
        return;
      }
      lastScrollTs = now;
      emit({
        type: "scroll",
        timestamp: now,
        url: location.href,
        payload: {
          x: window.scrollX || 0,
          y: window.scrollY || 0,
        },
      });
    },
    true
  );
})();
`;

export class PlaywrightDemonstrationRecorder {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private readonly events: DemonstrationRawEvent[] = [];
  private readonly listeners: Array<() => void> = [];
  private readonly tabIds = new Map<Page, string>();
  private started = false;
  private eventCounter = 0;
  private tabCounter = 0;

  async start(options: ObserveCaptureOptions): Promise<void> {
    const playwright = await import("playwright-core");
    this.browser = await playwright.chromium.connectOverCDP(options.cdpEndpoint);
    this.context = this.browser.contexts()[0] ?? (await this.browser.newContext());
    this.bindContextListener();

    const pages = this.context.pages();
    if (pages.length === 0) {
      const page = await this.context.newPage();
      await this.registerPage(page);
    } else {
      for (const page of pages) {
        await this.registerPage(page);
      }
    }
    this.started = true;
  }

  async stop(): Promise<DemonstrationRawEvent[]> {
    if (!this.started) {
      return [];
    }
    try {
      return [...this.events];
    } finally {
      await this.dispose();
    }
  }

  private bindContextListener(): void {
    const context = this.requireContext();
    const onPage = (page: Page): void => {
      void this.registerPage(page);
    };
    context.on("page", onPage);
    this.listeners.push(() => context.off("page", onPage));
  }

  private async registerPage(page: Page): Promise<void> {
    if (this.tabIds.has(page)) {
      return;
    }
    const tabId = this.nextTabId();
    this.tabIds.set(page, tabId);
    const openerTabId = await this.resolveOpenerTabId(page);

    const onConsole = (message: ConsoleMessage): void => {
      this.captureConsoleEvent(message, tabId, openerTabId);
    };
    const onFrameNavigated = (frame: Frame): void => {
      if (frame !== page.mainFrame()) {
        return;
      }
      this.pushEvent("navigate", page.url(), { reason: "main_frame_navigated" }, tabId, openerTabId);
    };

    page.on("console", onConsole);
    page.on("framenavigated", onFrameNavigated);
    this.listeners.push(() => page.off("console", onConsole));
    this.listeners.push(() => page.off("framenavigated", onFrameNavigated));

    await page.addInitScript({ content: OBSERVE_CAPTURE_SCRIPT });
    try {
      await page.evaluate(OBSERVE_CAPTURE_SCRIPT);
    } catch {
      // Cross-origin and navigation races can make evaluate fail; init script still covers future documents.
    }
    this.pushEvent("navigate", page.url(), { reason: "tab_attached" }, tabId, openerTabId);
  }

  private captureConsoleEvent(
    message: ConsoleMessage,
    tabId: string,
    openerTabId: string | undefined
  ): void {
    const text = message.text();
    if (!text.startsWith(OBSERVE_CONSOLE_PREFIX)) {
      return;
    }
    const jsonPart = text.slice(OBSERVE_CONSOLE_PREFIX.length);
    try {
      const event = JSON.parse(jsonPart) as RawBrowserEvent;
      this.pushEvent(event.type, event.url, event.payload, tabId, openerTabId, event.timestamp);
    } catch {
      // Ignore malformed capture events.
    }
  }

  private pushEvent(
    type: DemonstrationRawEvent["type"],
    url: string,
    payload: Record<string, unknown>,
    tabId: string,
    openerTabId?: string,
    timestampMs?: number
  ): void {
    this.eventCounter += 1;
    this.events.push({
      eventId: `event_${String(this.eventCounter).padStart(6, "0")}`,
      timestamp: this.toIsoTimestamp(timestampMs),
      type,
      url,
      tabId,
      openerTabId,
      payload,
    });
  }

  private toIsoTimestamp(timestampMs?: number): string {
    if (typeof timestampMs === "number" && Number.isFinite(timestampMs)) {
      return new Date(timestampMs).toISOString();
    }
    return new Date().toISOString();
  }

  private async resolveOpenerTabId(page: Page): Promise<string | undefined> {
    const opener = await page.opener();
    if (!opener) {
      return undefined;
    }
    return this.tabIds.get(opener);
  }

  private nextTabId(): string {
    this.tabCounter += 1;
    return `tab-${this.tabCounter}`;
  }

  private requireContext(): BrowserContext {
    if (!this.context) {
      throw new Error("demonstration recorder context is not initialized");
    }
    return this.context;
  }

  private async dispose(): Promise<void> {
    for (const remove of this.listeners.splice(0, this.listeners.length)) {
      remove();
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore CDP close errors during teardown.
      }
    }
    this.browser = null;
    this.context = null;
    this.tabIds.clear();
    this.started = false;
  }
}
