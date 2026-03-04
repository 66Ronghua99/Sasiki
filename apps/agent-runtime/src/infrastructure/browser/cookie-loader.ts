/**
 * Deps: contracts/logger.ts, node:fs/promises, node:os, node:path
 * Used By: infrastructure/browser/cdp-browser-launcher.ts
 * Last Updated: 2026-03-04
 */
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { Logger } from "../../contracts/logger.js";

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expires?: number;
}

export interface CookieLoadResult {
  filesLoaded: number;
  cookies: BrowserCookie[];
}

export class CookieLoader {
  private readonly cookiesDir: string;
  private readonly logger: Logger;

  constructor(cookiesDir: string, logger: Logger) {
    this.cookiesDir = this.expandHome(cookiesDir);
    this.logger = logger;
  }

  async loadAll(): Promise<CookieLoadResult> {
    try {
      const names = await readdir(this.cookiesDir);
      const jsonFiles = names.filter((name) => name.toLowerCase().endsWith(".json"));
      if (jsonFiles.length === 0) {
        return { filesLoaded: 0, cookies: [] };
      }

      const cookies: BrowserCookie[] = [];
      let filesLoaded = 0;
      for (const name of jsonFiles) {
        const loaded = await this.loadFile(path.join(this.cookiesDir, name));
        if (loaded.length > 0) {
          filesLoaded += 1;
          cookies.push(...loaded);
        }
      }
      return { filesLoaded, cookies };
    } catch {
      return { filesLoaded: 0, cookies: [] };
    }
  }

  private async loadFile(filePath: string): Promise<BrowserCookie[]> {
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      const cookieArray = this.extractCookieArray(parsed);
      if (!cookieArray) {
        return [];
      }
      const normalized = cookieArray
        .map((item) => this.normalizeCookie(item))
        .filter((item): item is BrowserCookie => Boolean(item));
      return normalized;
    } catch (error) {
      this.logger.warn("cookie_file_load_failed", {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private extractCookieArray(value: unknown): unknown[] | null {
    if (Array.isArray(value)) {
      return value;
    }
    if (!value || typeof value !== "object") {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.cookies)) {
      return record.cookies;
    }
    return null;
  }

  private normalizeCookie(value: unknown): BrowserCookie | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const name = this.readString(record.name);
    const cookieValue = this.readString(record.value);
    const domain = this.readString(record.domain);
    if (!name || !cookieValue || !domain) {
      return null;
    }

    const cookie: BrowserCookie = {
      name,
      value: cookieValue,
      domain,
      path: this.readString(record.path) ?? "/",
    };
    if (typeof record.secure === "boolean") {
      cookie.secure = record.secure;
    }
    if (typeof record.httpOnly === "boolean") {
      cookie.httpOnly = record.httpOnly;
    }
    const sameSite = this.normalizeSameSite(this.readString(record.sameSite));
    if (sameSite) {
      cookie.sameSite = sameSite;
    }
    const expires = this.readNumber(record.expires) ?? this.readNumber(record.expirationDate);
    if (typeof expires === "number" && Number.isFinite(expires)) {
      cookie.expires = expires;
    }
    return cookie;
  }

  private normalizeSameSite(raw: string | undefined): "Strict" | "Lax" | "None" | undefined {
    if (!raw) {
      return undefined;
    }
    const value = raw.trim().toLowerCase();
    if (value === "strict") {
      return "Strict";
    }
    if (value === "lax") {
      return "Lax";
    }
    if (value === "none") {
      return "None";
    }
    return undefined;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  private readNumber(value: unknown): number | undefined {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
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
