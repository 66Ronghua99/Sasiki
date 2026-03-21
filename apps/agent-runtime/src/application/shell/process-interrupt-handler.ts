/**
 * Deps: none
 * Used By: index.ts
 * Last Updated: 2026-03-21
 */
export interface ProcessInterruptHandlerOptions {
  requestInterrupt(signal: "SIGINT" | "SIGTERM"): Promise<boolean>;
  writeStderr(message: string): void;
  forceExit(code: number): void;
}

export function createProcessInterruptHandler(options: ProcessInterruptHandlerOptions) {
  let interrupting = false;

  return async (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
    if (interrupting) {
      options.writeStderr(`Force exiting after repeated ${signal}.\n`);
      options.forceExit(130);
      return;
    }

    interrupting = true;
    const handled = await options.requestInterrupt(signal);
    if (!handled) {
      options.writeStderr(`Received ${signal}, no graceful stop available. Exiting immediately.\n`);
      options.forceExit(130);
      return;
    }

    options.writeStderr(`Received ${signal}, requesting graceful stop and flushing logs...\n`);
  };
}
