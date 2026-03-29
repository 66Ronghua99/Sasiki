export interface DesktopAppQuitEventLike {
  preventDefault(): void;
}

export interface DesktopAppQuitHooksLike {
  on(event: "before-quit" | "will-quit", listener: (event: DesktopAppQuitEventLike) => void): void;
  on(event: "window-all-closed", listener: () => void): void;
  quit(): void;
}

export interface DesktopAppQuitHooksOptions {
  app: DesktopAppQuitHooksLike;
  platform?: string;
  stop(): Promise<void>;
}

export function registerDesktopQuitHooks(options: DesktopAppQuitHooksOptions): void {
  let stopPromise: Promise<void> | null = null;
  let quitting = false;

  const stopOnce = (): Promise<void> => {
    if (!stopPromise) {
      stopPromise = options.stop();
    }
    return stopPromise;
  };

  const reQuit = (): void => {
    if (quitting) {
      return;
    }

    quitting = true;
    options.app.quit();
  };

  const requestStop = (event?: DesktopAppQuitEventLike) => {
    if (quitting) {
      return;
    }

    event?.preventDefault();
    void stopOnce()
      .finally(reQuit)
      .catch((error) => {
        console.error(error);
      });
  };

  options.app.on("before-quit", requestStop);
  options.app.on("will-quit", requestStop);
  options.app.on("window-all-closed", () => {
    if (options.platform === "darwin") {
      return;
    }

    requestStop();
  });
}
