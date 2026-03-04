import type { Logger } from "../../contracts/logger.js";

export class ConsoleLogger implements Logger {
  info(event: string, payload?: Record<string, unknown>): void {
    this.log("INFO", event, payload);
  }

  warn(event: string, payload?: Record<string, unknown>): void {
    this.log("WARN", event, payload);
  }

  error(event: string, payload?: Record<string, unknown>): void {
    this.log("ERROR", event, payload);
  }

  private log(level: string, event: string, payload?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const body = payload ? ` ${JSON.stringify(payload)}` : "";
    // Structured single-line log for easy ingestion.
    process.stdout.write(`${timestamp} ${level} ${event}${body}\n`);
  }
}
