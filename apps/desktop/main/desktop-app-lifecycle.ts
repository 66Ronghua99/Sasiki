export interface DesktopAppQuitHooksLike {
  on(event: "before-quit" | "will-quit" | "window-all-closed", listener: () => void): void;
  quit(): void;
}

export interface DesktopAppQuitHooksOptions {
  app: DesktopAppQuitHooksLike;
  platform?: string;
  stop(): Promise<void>;
}

export function registerDesktopQuitHooks(options: DesktopAppQuitHooksOptions): void {
  let stopPromise: Promise<void> | null = null;

  const stopOnce = (): Promise<void> => {
    if (!stopPromise) {
      stopPromise = options.stop();
    }
    return stopPromise;
  };

  const requestStop = () => {
    void stopOnce();
  };

  options.app.on("before-quit", requestStop);
  options.app.on("will-quit", requestStop);
  options.app.on("window-all-closed", () => {
    if (options.platform === "darwin") {
      return;
    }

    void stopOnce().finally(() => {
      options.app.quit();
    });
  });
}
