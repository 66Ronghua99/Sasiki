/**
 * Deps: contracts/logger.ts, infrastructure/browser/cookie-loader.ts
 * Used By: runtime/agent-runtime.ts
 * Last Updated: 2026-03-04
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { Logger } from "../../contracts/logger.js";
import { CookieLoader } from "./cookie-loader.js";

export interface CdpBrowserLauncherConfig {
  cdpEndpoint: string;
  launchCdp: boolean;
  userDataDir: string;
  resetPagesOnLaunch: boolean;
  headless: boolean;
  executablePath?: string;
  startupTimeoutMs: number;
  injectCookies: boolean;
  cookiesDir: string;
  preferSystemBrowser: boolean;
}

export interface CdpLaunchResult {
  launched: boolean;
  endpoint: string;
  executable?: string;
  cookieFilesLoaded: number;
  cookiesInjected: number;
}

interface ResolvedExecutable {
  executable: string;
  source: "configured" | "system" | "playwright" | "playwright-core";
}

export class CdpBrowserLauncher {
  private readonly config: CdpBrowserLauncherConfig;
  private readonly logger: Logger;
  private process: ChildProcess | null = null;

  constructor(config: CdpBrowserLauncherConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async start(): Promise<CdpLaunchResult> {
    if (!this.config.launchCdp) {
      this.logger.info("cdp_launch_skipped", { reason: "disabled", endpoint: this.config.cdpEndpoint });
      return { launched: false, endpoint: this.config.cdpEndpoint, cookieFilesLoaded: 0, cookiesInjected: 0 };
    }
    if (!this.isLocalEndpoint(this.config.cdpEndpoint)) {
      this.logger.warn("cdp_launch_skipped", { reason: "non_local_endpoint", endpoint: this.config.cdpEndpoint });
      return { launched: false, endpoint: this.config.cdpEndpoint, cookieFilesLoaded: 0, cookiesInjected: 0 };
    }
    if (await this.isEndpointReady()) {
      this.logger.info("cdp_launch_skipped", { reason: "endpoint_already_ready", endpoint: this.config.cdpEndpoint });
      const cookies = await this.injectCookiesIfNeeded();
      return {
        launched: false,
        endpoint: this.config.cdpEndpoint,
        cookieFilesLoaded: cookies.filesLoaded,
        cookiesInjected: cookies.cookiesInjected,
      };
    }

    const resolvedExecutable = await this.resolveExecutable();
    if (!resolvedExecutable) {
      throw new Error(
        "CDP launch failed: chrome executable not found. Set CHROME_EXECUTABLE_PATH or disable LAUNCH_CDP."
      );
    }
    this.logger.info("cdp_launch_browser_selected", {
      source: resolvedExecutable.source,
      executable: resolvedExecutable.executable,
    });

    const port = this.parsePort(this.config.cdpEndpoint);
    const userDataDir = this.expandHome(this.config.userDataDir);
    await mkdir(userDataDir, { recursive: true });

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=Translate",
      "about:blank",
    ];
    if (this.config.headless) {
      args.unshift("--headless=new");
    }

    this.logger.info("cdp_launch_starting", {
      endpoint: this.config.cdpEndpoint,
      executable: resolvedExecutable.executable,
      userDataDir,
      headless: this.config.headless,
    });

    this.process = spawn(resolvedExecutable.executable, args, {
      detached: true,
      stdio: "ignore",
    });
    this.process.unref();

    await this.waitForEndpointReady();
    const cookies = await this.injectCookiesIfNeeded();
    await this.resetPagesOnLaunchIfNeeded();
    this.logger.info("cdp_launch_ready", {
      endpoint: this.config.cdpEndpoint,
      pid: this.process.pid,
      cookieFilesLoaded: cookies.filesLoaded,
      cookiesInjected: cookies.cookiesInjected,
    });

    return {
      launched: true,
      endpoint: this.config.cdpEndpoint,
      executable: resolvedExecutable.executable,
      cookieFilesLoaded: cookies.filesLoaded,
      cookiesInjected: cookies.cookiesInjected,
    };
  }

  async stop(): Promise<void> {
    const closedByCdp = await this.closeBrowserOverCdp();
    if (closedByCdp) {
      this.process = null;
      return;
    }

    if (!this.process || this.process.killed) {
      return;
    }
    this.logger.info("cdp_launch_stopping", { pid: this.process.pid });
    try {
      this.process.kill("SIGTERM");
    } catch (error) {
      this.logger.warn("cdp_launch_stop_failed", {
        pid: this.process.pid,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.process = null;
    }
  }

  private async closeBrowserOverCdp(): Promise<boolean> {
    if (!this.isLocalEndpoint(this.config.cdpEndpoint)) {
      this.logger.warn("cdp_close_skipped", { reason: "non_local_endpoint", endpoint: this.config.cdpEndpoint });
      return false;
    }
    if (!(await this.isEndpointReady())) {
      return false;
    }

    const playwright = await this.loadPlaywrightForCdp();
    if (!playwright) {
      this.logger.warn("cdp_close_skipped", {
        reason: "playwright_module_missing",
        endpoint: this.config.cdpEndpoint,
      });
      return false;
    }

    let browser: any | null = null;
    try {
      browser = await playwright.chromium.connectOverCDP(this.config.cdpEndpoint);
      if (typeof browser?.newBrowserCDPSession !== "function") {
        this.logger.warn("cdp_close_skipped", {
          reason: "browser_cdp_session_unavailable",
          endpoint: this.config.cdpEndpoint,
        });
        return false;
      }
      const session = await browser.newBrowserCDPSession();
      await session.send("Browser.close");
      this.logger.info("cdp_close_succeeded", { endpoint: this.config.cdpEndpoint, method: "Browser.close" });
      return true;
    } catch (error) {
      this.logger.warn("cdp_close_failed", {
        endpoint: this.config.cdpEndpoint,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Browser.close may already terminate the CDP session.
        }
      }
    }
  }

  private async waitForEndpointReady(): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < this.config.startupTimeoutMs) {
      if (await this.isEndpointReady()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`CDP endpoint not ready within ${this.config.startupTimeoutMs}ms: ${this.config.cdpEndpoint}`);
  }

  private async isEndpointReady(): Promise<boolean> {
    const url = `${this.config.cdpEndpoint.replace(/\/$/, "")}/json/version`;
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async resolveExecutable(): Promise<ResolvedExecutable | null> {
    if (this.config.executablePath?.trim()) {
      return { executable: this.config.executablePath.trim(), source: "configured" };
    }

    const system = this.resolveSystemExecutable();
    const playwright = await this.resolvePlaywrightExecutable();
    if (this.config.preferSystemBrowser) {
      return system ?? playwright;
    }
    return playwright ?? system;
  }

  private resolveSystemExecutable(): ResolvedExecutable | null {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "google-chrome",
      "chromium-browser",
      "chromium",
    ];
    for (const candidate of candidates) {
      if (!candidate.includes("/") || existsSync(candidate)) {
        return { executable: candidate, source: "system" };
      }
    }
    return null;
  }

  private async resolvePlaywrightExecutable(): Promise<ResolvedExecutable | null> {
    const candidates = ["playwright", "playwright-core"];
    for (const pkg of candidates) {
      try {
        const mod: any = await import(pkg);
        const executable = mod?.chromium?.executablePath?.();
        if (typeof executable === "string" && executable && existsSync(executable)) {
          const source = pkg === "playwright-core" ? "playwright-core" : "playwright";
          return { executable, source };
        }
      } catch {
        // optional dependency; continue
      }
    }
    return null;
  }

  private async injectCookiesIfNeeded(): Promise<{ filesLoaded: number; cookiesInjected: number }> {
    if (!this.config.injectCookies) {
      return { filesLoaded: 0, cookiesInjected: 0 };
    }

    const loader = new CookieLoader(this.config.cookiesDir, this.logger);
    const loaded = await loader.loadAll();
    if (loaded.filesLoaded === 0 || loaded.cookies.length === 0) {
      this.logger.info("cdp_cookie_injection_skipped", {
        reason: "no_cookie_files",
        cookiesDir: this.config.cookiesDir,
      });
      return { filesLoaded: loaded.filesLoaded, cookiesInjected: 0 };
    }

    const playwright = await this.loadPlaywrightForCdp();
    if (!playwright) {
      this.logger.warn("cdp_cookie_injection_skipped", {
        reason: "playwright_module_missing",
        filesLoaded: loaded.filesLoaded,
        cookieCount: loaded.cookies.length,
      });
      return { filesLoaded: loaded.filesLoaded, cookiesInjected: 0 };
    }

    const browser = await playwright.chromium.connectOverCDP(this.config.cdpEndpoint);
    try {
      const context = browser.contexts()[0] ?? (await browser.newContext());
      await context.addCookies(loaded.cookies as any);
      this.logger.info("cdp_cookie_injected", {
        endpoint: this.config.cdpEndpoint,
        filesLoaded: loaded.filesLoaded,
        cookiesInjected: loaded.cookies.length,
      });
      return { filesLoaded: loaded.filesLoaded, cookiesInjected: loaded.cookies.length };
    } catch (error) {
      this.logger.warn("cdp_cookie_injection_failed", {
        error: error instanceof Error ? error.message : String(error),
        filesLoaded: loaded.filesLoaded,
      });
      return { filesLoaded: loaded.filesLoaded, cookiesInjected: 0 };
    } finally {
      await browser.close();
    }
  }

  private async resetPagesOnLaunchIfNeeded(): Promise<void> {
    if (!this.config.resetPagesOnLaunch) {
      return;
    }

    const playwright = await this.loadPlaywrightForCdp();
    if (!playwright) {
      this.logger.warn("cdp_page_reset_skipped", {
        reason: "playwright_module_missing",
        endpoint: this.config.cdpEndpoint,
      });
      return;
    }

    let browser: any | null = null;
    try {
      browser = await playwright.chromium.connectOverCDP(this.config.cdpEndpoint);
      const existingContexts = browser.contexts();
      const primaryContext = existingContexts[0] ?? (await browser.newContext());
      const blankPage = await primaryContext.newPage();
      const pagesToClose = browser
        .contexts()
        .flatMap((context: any) => context.pages())
        .filter((page: any) => page !== blankPage);

      for (const page of pagesToClose) {
        await page.close({ runBeforeUnload: false });
      }

      await blankPage.bringToFront().catch(() => {});
      this.logger.info("cdp_page_reset_succeeded", {
        endpoint: this.config.cdpEndpoint,
        closedPages: pagesToClose.length,
      });
    } catch (error) {
      this.logger.warn("cdp_page_reset_failed", {
        endpoint: this.config.cdpEndpoint,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  private async loadPlaywrightForCdp(): Promise<any | null> {
    const candidates = ["playwright", "playwright-core"];
    for (const pkg of candidates) {
      try {
        const mod: any = await import(pkg);
        if (mod?.chromium?.connectOverCDP) {
          return mod;
        }
      } catch {
        // optional dependency; continue
      }
    }
    return null;
  }

  private isLocalEndpoint(endpoint: string): boolean {
    const host = new URL(endpoint).hostname;
    return host === "localhost" || host === "127.0.0.1";
  }

  private parsePort(endpoint: string): number {
    const url = new URL(endpoint);
    return url.port ? Number(url.port) : 9222;
  }

  private expandHome(inputPath: string): string {
    if (inputPath.startsWith("~/")) {
      return path.join(homedir(), inputPath.slice(2));
    }
    if (inputPath === "~") {
      return homedir();
    }
    return inputPath;
  }
}
