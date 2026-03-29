import { BrowserWindow, app, ipcMain, shell } from "electron";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerDesktopQuitHooks } from "./desktop-app-lifecycle";
import { createDesktopMainContext } from "./desktop-main-context";
import { createEmbeddedLoginLauncher } from "./accounts/embedded-login-launcher";
import { CookieImportService } from "./accounts/cookie-import-service";
import { CredentialBundleStore } from "./accounts/credential-bundle-store";
import { EmbeddedLoginService } from "./accounts/embedded-login-service";
import { LoginVerifier } from "./accounts/login-verifier";
import { RuntimeProfileManager } from "./accounts/runtime-profile-manager";
import { SiteAccountStore } from "./accounts/site-account-store";
import { SiteRegistry } from "./accounts/site-registry";
import { ExtensionCaptureServer } from "./browser/extension-capture-server";
import { createDesktopRuntimeFactory } from "./runs/desktop-runtime-factory";
import { RunEventBus } from "./runs/run-event-bus";
import { RunManager } from "./runs/run-manager";
import { SopSkillStore } from "../../agent-runtime/src/infrastructure/persistence/sop-skill-store";

const currentDir = dirname(fileURLToPath(import.meta.url));
const desktopRootDir = join(homedir(), ".sasiki", "desktop");
const skillRootDir = join(homedir(), ".sasiki", "skills");

const siteRegistry = new SiteRegistry();
const siteAccountStore = new SiteAccountStore({ rootDir: desktopRootDir });
const credentialStore = new CredentialBundleStore({ rootDir: desktopRootDir, siteAccountStore });
const embeddedLoginService = new EmbeddedLoginService({ credentialStore });
const cookieImportService = new CookieImportService({ credentialStore });
const loginVerifier = new LoginVerifier({
  siteAccountStore,
  credentialStore,
  siteRegistry,
});
const runtimeProfileManager = new RuntimeProfileManager({
  rootDir: desktopRootDir,
  siteAccountStore,
});
const extensionCaptureServer = new ExtensionCaptureServer({
  credentialStore,
  siteAccountStore,
  siteRegistry,
  rootDir: desktopRootDir,
});
const runtimeFactory = createDesktopRuntimeFactory({
  rootDir: desktopRootDir,
  siteAccountStore,
  credentialStore,
  runtimeProfileManager,
  siteRegistry,
});
const runManager = new RunManager({
  createRuntime: runtimeFactory,
  events: new RunEventBus(),
});
const skillStore = new SopSkillStore(skillRootDir);
const desktopMainContext = createDesktopMainContext({
  ipcMain,
  shell: {
    openPath: async (path: string): Promise<string> => shell.openPath(path),
  },
  siteAccountStore,
  embeddedLoginService,
  embeddedLoginLauncher: createEmbeddedLoginLauncher({
    siteAccountStore,
    siteRegistry,
    windowFactory: {
      create(options) {
        return new BrowserWindow(options);
      },
    },
  }),
  cookieImportService,
  loginVerifier,
  extensionCaptureServer,
  runManager,
  skillStore,
  skillRootDir,
});

registerDesktopQuitHooks({
  app,
  platform: process.platform,
  stop: () => desktopMainContext.stop(),
});

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
    await desktopMainContext.start();
    await createMainWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      }
    });
  })
  .catch((error) => {
    console.error(error);
    void desktopMainContext.stop().finally(() => {
      app.quit();
    });
});
