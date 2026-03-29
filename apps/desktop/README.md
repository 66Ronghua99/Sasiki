# Desktop App

This package hosts the Electron desktop front door for Sasiki.

## Package Shape

- `main/`: desktop orchestration owner for accounts, credentials, runtime profiles, runs, and artifact access
- `preload/`: safe renderer bridge exposed as `window.sasiki`
- `renderer/`: UI-only client for `Workflows`, `Accounts`, and `Runs`
- `shared/`: desktop DTOs, channels, and IPC contracts
- `browser-extension/`: Chromium one-click cookie capture extension

## Commands

```bash
npm --prefix apps/desktop install
npm --prefix apps/desktop run dev
npm --prefix apps/desktop run test
npm --prefix apps/desktop run typecheck
npm --prefix apps/desktop run build
```

## Desktop Truth

- Electron main is the desktop orchestration owner.
- `apps/agent-runtime` remains the workflow runtime owner.
- Renderer must only talk through preload contracts and must not import Node/Electron privileges directly.
- Desktop v1 is Chromium-only and designed for macOS first, with Windows compatibility reserved at the process-boundary level.
