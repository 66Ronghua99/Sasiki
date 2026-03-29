import { contextBridge, ipcRenderer } from "electron";
import { createDesktopPreloadApi, exposeDesktopPreloadApi } from "./desktop-api";

const desktopApi = createDesktopPreloadApi({
  invoke: ipcRenderer.invoke.bind(ipcRenderer),
  on: ipcRenderer.on.bind(ipcRenderer),
  removeListener: ipcRenderer.removeListener.bind(ipcRenderer),
});

exposeDesktopPreloadApi(contextBridge, desktopApi);

declare global {
  interface Window {
    sasiki: typeof desktopApi;
  }
}
