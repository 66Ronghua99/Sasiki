/**
 * Deps: contracts/logger.ts
 * Used By: runtime/migration-runtime.ts
 * Last Updated: 2026-03-04
 */
import type { Logger } from "../../contracts/logger.js";

export class RunLogger implements Logger {
  private readonly lines: string[] = [];

  info(event: string, payload?: Record<string, unknown>): void {
    this.log("INFO", event, payload);
  }

  warn(event: string, payload?: Record<string, unknown>): void {
    this.log("WARN", event, payload);
  }

  error(event: string, payload?: Record<string, unknown>): void {
    this.log("ERROR", event, payload);
  }

  toText(): string {
    if (this.lines.length === 0) {
      return "";
    }
    return `${this.lines.join("\n")}\n`;
  }

  reset(): void {
    this.lines.length = 0;
  }

  private log(level: string, event: string, payload?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const body = payload ? ` ${JSON.stringify(payload)}` : "";
    const line = `${timestamp} ${level} ${event}${body}`;
    this.lines.push(line);
    process.stdout.write(`${line}\n`);
  }
}
