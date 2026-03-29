# NEXT_STEP

- `P0` 执行 desktop UI v1 的首个 live smoke / acceptance pass：在 macOS Chromium 环境里用真实 `site account` 走通一次 `内置登录或 cookie 导入 -> observe -> sop-compact -> refine -> artifact 检查`，同时记录 `startup-failure catch branch` 测试缺口和 `createDesktopMainContext.start()` partial-startup asymmetry 的后续收口方案，再决定 Windows 兼容工作的第一刀。
