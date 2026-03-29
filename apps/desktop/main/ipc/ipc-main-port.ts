export interface DesktopIpcInvokeEvent {
  sender: unknown;
}

export interface DesktopIpcMain {
  handle(
    channel: string,
    listener: (event: DesktopIpcInvokeEvent, request: unknown) => Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}

