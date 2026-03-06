# Checklist: Runtime Config Root Resolution

- [x] 去除 runtime 根目录解析对 `PROGRESS.md` / `AGENTS.md` 的依赖
- [x] 相对 `artifactsDir` 改为基于工程根标记解析
- [x] README 补充本地代理环境下的 `NO_PROXY` 说明
- [x] MEMORY 记录自测代理坑点
- [x] `npm --prefix apps/agent-runtime run typecheck` 通过
- [x] `npm --prefix apps/agent-runtime run build` 通过
