import { BrowserWindow, app, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerDesktopIpc } from "./register-ipc";

const currentDir = dirname(fileURLToPath(import.meta.url));

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: join(currentDir, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await window.loadURL(
    process.env.ELECTRON_RENDERER_URL ??
      pathToFileURL(join(currentDir, "../renderer/index.html")).toString(),
  );

  return window;
}

void app
  .whenReady()
  .then(async () => {
    registerDesktopIpc({ ipcMain, app });
    await createMainWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      }
    });
  })
  .catch((error) => {
    console.error(error);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
